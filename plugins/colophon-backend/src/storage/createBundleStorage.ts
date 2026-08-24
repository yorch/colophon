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

const localStorageFactory: BundleStorageFactory = ({ config }) => {
  // `directory`, matching what every piece of documentation says. This read
  // `local.root` until a real backend was pointed at a real bundle: config
  // keys nobody reads are silently dropped, so the storage fell back to its
  // default root, publishes succeeded, and every read 404'd afterwards.
  return new LocalBundleStorage(
    config?.getOptionalString('directory') ?? DEFAULT_LOCAL_STORAGE_ROOT,
  );
};

/**
 * Credentials are left to the AWS SDK's default provider chain unless config
 * names them explicitly, so an IRSA or instance-role deployment needs no
 * secrets in `app-config.yaml` at all.
 */
const s3StorageFactory: BundleStorageFactory = ({ config }) => {
  const bucket = config?.getOptionalString('bucket');
  if (!bucket) {
    throw new InputError(
      'colophon.storage.s3.bucket is required when storage type is "s3"',
    );
  }
  const accessKeyId = config?.getOptionalString('credentials.accessKeyId');
  const secretAccessKey = config?.getOptionalString(
    'credentials.secretAccessKey',
  );
  return new S3BundleStorage({
    bucket,
    prefix: config?.getOptionalString('prefix'),
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
  registry.addFactory('local', localStorageFactory);
  registry.addFactory('s3', s3StorageFactory);
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
