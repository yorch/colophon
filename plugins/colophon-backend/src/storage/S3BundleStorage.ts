import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { NotFoundError } from '@backstage/errors';
import type { BundleStorage } from './types';

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

/** Object-storage implementation. Any S3-compatible endpoint works. */
export class S3BundleStorage implements BundleStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #prefix: string;

  constructor(options: { client: S3Client; bucket: string; prefix?: string }) {
    this.#client = options.client;
    this.#bucket = options.bucket;
    // Normalised to either '' or 'something/', so #keyFor is a plain concat.
    const prefix = options.prefix?.replace(/^\/+|\/+$/g, '') ?? '';
    this.#prefix = prefix ? `${prefix}/` : '';
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: this.#keyFor(key) }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: this.#keyFor(key) }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        throw new NotFoundError(`Empty body at storage key "${key}"`);
      }
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) {
        throw new NotFoundError(`No object at storage key "${key}"`);
      }
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.#keyFor(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  #keyFor(key: string): string {
    return `${this.#prefix}${key}`;
  }
}
