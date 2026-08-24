import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { BundleStorageRegistry } from './BundleStorageRegistry';
import { LocalBundleStorage } from './LocalBundleStorage';
import { S3BundleStorage } from './S3BundleStorage';
import type { BundleStorage, BundleStorageFactory } from './types';

/** Where a `local` store puts its files when config does not say. */
export const DEFAULT_LOCAL_STORAGE_ROOT = './colophon-storage';

const localStorageFactory: BundleStorageFactory = ({ config, logger }) => {
  // `directory`, matching what every piece of documentation says. This read
  // `local.root` until a real backend was pointed at a real bundle: config
  // keys nobody reads are silently dropped, so the storage fell back to its
  // default root, publishes succeeded, and every read 404'd afterwards.
  const directory =
    config?.getOptionalString('directory') ?? DEFAULT_LOCAL_STORAGE_ROOT;
  // Resolved, not as written: the path is relative to the backend PROCESS,
  // not to app-config.yaml, and that difference is the whole of the bug
  // above. Logging the absolute path is what makes it checkable.
  logger.info(`Reading bundles from ${resolve(directory)}`);
  return new LocalBundleStorage(directory);
};

/**
 * Credentials are left to the AWS SDK's default provider chain unless config
 * names them explicitly, so an IRSA or instance-role deployment needs no
 * secrets in `app-config.yaml` at all.
 */
const s3StorageFactory: BundleStorageFactory = ({ config, logger }) => {
  const bucket = config?.getOptionalString('bucket');
  if (!bucket) {
    throw new InputError(
      'colophon.storage.s3.bucket is required when storage type is "s3"',
    );
  }
  const prefix = config?.getOptionalString('prefix');
  const accessKeyId = config?.getOptionalString('credentials.accessKeyId');
  const secretAccessKey = config?.getOptionalString(
    'credentials.secretAccessKey',
  );
  // Bucket and prefix only. Neither is a secret, and both are what an
  // operator needs to confirm the backend is pointed where CI publishes.
  logger.info(
    `Reading bundles from s3://${bucket}/${prefix ?? ''} (endpoint ${
      config?.getOptionalString('endpoint') ?? 'AWS default'
    })`,
  );
  return new S3BundleStorage({
    bucket,
    prefix,
    client: new S3Client({
      region: config?.getOptionalString('region'),
      endpoint: config?.getOptionalString('endpoint'),
      forcePathStyle: config?.getOptionalBoolean('forcePathStyle'),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    }),
  });
};

/**
 * A registry holding the two stores that ship with the plugin.
 *
 * They go in through `addFactory` — the same call an adopter's module makes —
 * rather than being special-cased in the lookup. A built-in shortcut would
 * leave the adopter path as the one nothing here exercises, and this project
 * has paid for that shape before.
 */
export function createBundleStorageRegistry(): BundleStorageRegistry {
  const registry = new BundleStorageRegistry();
  registry.addFactory({ name: 'local', factory: localStorageFactory });
  registry.addFactory({ name: 's3', factory: s3StorageFactory });
  return registry;
}

/**
 * Builds the store described by `colophon.storage`, from the built-ins alone.
 *
 * The plugin does NOT use this: it needs the registry that modules have
 * contributed to. This is for a caller assembling the service by hand, where
 * there are no modules to contribute anything.
 */
export function createBundleStorage(options: {
  config: RootConfigService;
  logger: LoggerService;
}): Promise<BundleStorage> {
  return createBundleStorageRegistry().create(options);
}
