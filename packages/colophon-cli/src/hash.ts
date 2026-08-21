import { createHash } from 'node:crypto';

/** sha256 of raw bytes, lowercase hex — the form every content hash in the
 * bundle contract uses (see colophon-common/ids.ts's `contentHashSchema`). */
export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
