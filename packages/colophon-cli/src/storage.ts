import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Where a published bundle is written.
 *
 * Deliberately the same three operations the backend's reader uses, so the
 * two halves of the contract stay recognisably the same shape. `has` exists
 * so the publisher can skip re-uploading a blob it already stored, which is
 * what makes retained history affordable.
 */
export interface BundleStorage {
  has(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
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
}

export class S3BundleStorage implements BundleStorage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: { bucket: string; region?: string; client?: S3Client }) {
    this.#bucket = options.bucket;
    this.#client = options.client ?? new S3Client({ region: options.region });
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
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
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
    if (!result.Body) {
      // S3 only omits the body for a zero-byte object or a malformed
      // response; either way, silently returning empty would corrupt a page.
      throw new Error(`Object "${key}" returned no body`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }
}
