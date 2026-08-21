/**
 * Blob access for the backend.
 *
 * Deliberately three methods. The backend only ever READS published bundles;
 * `put` exists because tests and local development need to seed a store, and
 * because a single interface is easier to reason about than a read/write
 * split. Production deployments are expected to hand the backend read-only
 * credentials, which is why nothing on the ingestion path calls `put`.
 */
export interface BundleStorage {
  has(key: string): Promise<boolean>;
  /** Throws `NotFoundError` when the key is absent. */
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}
