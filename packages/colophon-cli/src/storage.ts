import type { Dirent } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** One object in the store, as a listing reports it. */
export interface StoredObject {
  key: string;
  size: number;
  /** Absent when the backend cannot report one; treated as "unknown age". */
  lastModified?: Date;
}

/**
 * Where a published bundle is written.
 *
 * `has`, `put` and `get` are the publisher's half and mirror the backend's
 * reader, so the two halves of the contract stay recognisably the same shape.
 * `has` is what lets the publisher skip re-uploading a blob it already
 * stored, which is what makes retained history affordable.
 *
 * `list` and `delete` exist for garbage collection, and only here. The
 * backend is expected to hold read-only credentials — nothing it does ever
 * writes to the bucket — so the one component that already needs write access
 * is the one that gets the ability to remove things. `list` reports size and
 * age because a sweep has to report bytes before it is confirmed, and has to
 * be able to leave a just-uploaded object alone.
 */
export interface BundleStorage {
  has(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
}

export class LocalBundleStorage implements BundleStorage {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #pathFor(key: string): string {
    return join(this.#root, key);
  }

  async has(key: string): Promise<boolean> {
    try {
      await stat(this.#pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.#pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.#pathFor(key));
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const root = this.#pathFor(prefix);
    const found: StoredObject[] = [];
    // A missing prefix is an empty listing, not an error: a store that has
    // never held an asset simply has no `blobs/` directory, and the collector
    // asks for both namespaces unconditionally.
    let entries: Dirent[];
    try {
      entries = await readdir(root, { recursive: true, withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const absolute = join(entry.parentPath, entry.name);
      const stats = await stat(absolute);
      found.push({
        // Keys are always `/`-separated; the filesystem separator is an
        // implementation detail of this backend and must not leak into a key
        // the caller then compares against blobKey().
        key: absolute
          .slice(this.#root.length + 1)
          .split(sep)
          .join('/'),
        size: stats.size,
        lastModified: stats.mtime,
      });
    }
    return found;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.#pathFor(key));
    } catch (error) {
      // Already absent is the outcome the caller wanted.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export class S3BundleStorage implements BundleStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #prefix: string;

  constructor(options: {
    bucket: string;
    region?: string;
    /** Key prefix, matching the backend's `colophon.storage.s3.prefix`. */
    prefix?: string;
    /** Custom endpoint, for MinIO, R2 and other S3-compatible stores. */
    endpoint?: string;
    forcePathStyle?: boolean;
    client?: S3Client;
  }) {
    this.#bucket = options.bucket;
    // The prefix is part of the effective key, so the publisher and the
    // backend must apply the same one. Supporting it on only one side means
    // publishing succeeds to the bucket root while the backend 404s every
    // page — a misconfiguration that looks like a successful publish.
    this.#prefix = options.prefix
      ? `${options.prefix.replace(/\/+$/, '')}/`
      : '';
    this.#client =
      options.client ??
      new S3Client({
        region: options.region,
        endpoint: options.endpoint,
        forcePathStyle: options.forcePathStyle,
      });
  }

  #key(key: string): string {
    return `${this.#prefix}${key}`;
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: this.#key(key) }),
      );
      return true;
    } catch (error) {
      // 403 counts as absence here, deliberately, and unlike in the backend.
      // S3 answers HeadObject on a missing key with 403 rather than 404 when
      // the caller lacks s3:ListBucket — which is precisely the write-only
      // role CI should be given. Treating it as an error would make the
      // least-privilege setup the one that fails.
      //
      // The cost is bounded: a genuine permissions problem only means the
      // upload is attempted, and put() then fails loudly rather than
      // silently skipping content.
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        return false;
      }
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.#key(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: this.#key(key) }),
    );
    if (!result.Body) {
      // S3 only omits the body for a zero-byte object or a malformed
      // response; either way, silently returning empty would corrupt a page.
      throw new Error(`Object "${key}" returned no body`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const found: StoredObject[] = [];
    let token: string | undefined;
    // Paged to exhaustion rather than taking the first page. A truncated
    // listing read as complete would report every object beyond the first
    // thousand as unreferenced, and a sweep would then delete the corpus.
    do {
      const page = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          Prefix: this.#key(prefix),
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        found.push({
          // Reported without the configured prefix, so keys compare directly
          // against the ones colophon-common computes.
          key: object.Key.slice(this.#prefix.length),
          size: object.Size ?? 0,
          lastModified: object.LastModified,
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return found;
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: this.#key(key) }),
    );
  }
}
