import { S3Client } from '@aws-sdk/client-s3';
import type { RootConfigService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { LocalBundleStorage } from './LocalBundleStorage';
import { S3BundleStorage } from './S3BundleStorage';
import type { BundleStorage } from './types';

/** Where a `local` store puts its files when config does not say. */
export const DEFAULT_LOCAL_STORAGE_ROOT = './colophon-storage';

/**
 * Builds the store described by `colophon.storage`.
 *
 * Credentials are left to the AWS SDK's default provider chain unless config
 * names them explicitly, so an IRSA or instance-role deployment needs no
 * secrets in `app-config.yaml` at all.
 */
export function createBundleStorage(config: RootConfigService): BundleStorage {
  const storage = config.getOptionalConfig('colophon.storage');
  const type = storage?.getOptionalString('type') ?? 'local';

  if (type === 'local') {
    // `directory`, matching what every piece of documentation says. This read
    // `local.root` until a real backend was pointed at a real bundle: config
    // keys nobody reads are silently dropped, so the storage fell back to its
    // default root, publishes succeeded, and every read 404'd afterwards.
    const root =
      storage?.getOptionalString('local.directory') ??
      DEFAULT_LOCAL_STORAGE_ROOT;
    return new LocalBundleStorage(root);
  }

  if (type === 's3') {
    const s3 = storage?.getOptionalConfig('s3');
    const bucket = s3?.getOptionalString('bucket');
    if (!bucket) {
      throw new InputError(
        'colophon.storage.s3.bucket is required when storage type is "s3"',
      );
    }
    const accessKeyId = s3?.getOptionalString('credentials.accessKeyId');
    const secretAccessKey = s3?.getOptionalString(
      'credentials.secretAccessKey',
    );
    return new S3BundleStorage({
      bucket,
      prefix: s3?.getOptionalString('prefix'),
      client: new S3Client({
        region: s3?.getOptionalString('region'),
        endpoint: s3?.getOptionalString('endpoint'),
        forcePathStyle: s3?.getOptionalBoolean('forcePathStyle'),
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
      }),
    });
  }

  throw new InputError(
    `Unknown colophon.storage.type "${type}", expected "local" or "s3"`,
  );
}
