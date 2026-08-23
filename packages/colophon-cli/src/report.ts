import pc from 'picocolors';
import type { GcPlan } from './gc';
import type { UploadStats } from './publish';
import type { StoredObject } from './storage';
import type { Diagnostic } from './types';

export function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map(diagnostic => {
    const label =
      diagnostic.level === 'error' ? pc.red('error') : pc.yellow('warning');
    // `path:line` is the shape editors and terminals already know how to turn
    // into a jump, so it is worth matching exactly.
    const where = diagnostic.path
      ? `${pc.dim(
          diagnostic.line
            ? `${diagnostic.path}:${diagnostic.line}`
            : diagnostic.path,
        )}: `
      : '';
    return `  ${label} ${where}${diagnostic.message}`;
  });
}

export function summarize(counts: {
  pages: number;
  assets: number;
  diagnostics: Diagnostic[];
}): string {
  const errors = counts.diagnostics.filter(d => d.level === 'error').length;
  const warnings = counts.diagnostics.length - errors;
  const parts = [
    `${counts.pages} page${counts.pages === 1 ? '' : 's'}`,
    `${counts.assets} asset${counts.assets === 1 ? '' : 's'}`,
  ];
  if (errors) {
    parts.push(pc.red(`${errors} error${errors === 1 ? '' : 's'}`));
  }
  if (warnings) {
    parts.push(pc.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));
  }
  return parts.join(', ');
}

export function formatUpload(stats: UploadStats): string {
  return `uploaded ${stats.blobsUploaded} blob${
    stats.blobsUploaded === 1 ? '' : 's'
  } (${formatBytes(stats.bytesUploaded)}), reused ${stats.blobsSkipped} (${formatBytes(
    stats.bytesSkipped,
  )})`;
}

/**
 * What a sweep found, and — when it is a dry run — that it did nothing.
 *
 * The last two lines are the point of the whole format. A destructive tool
 * that reports its findings and then leaves is easy to misread as one that
 * has already acted, so the run says which it was, in words, every time.
 */
export function formatGcPlan(
  plan: GcPlan,
  options: { confirmed: boolean },
): string[] {
  const bytesOf = (objects: StoredObject[]) =>
    objects.reduce((total, object) => total + object.size, 0);

  const row = (label: string, value: number, suffix = '') =>
    `  ${label}`.padEnd(18) +
    value.toLocaleString('en-US').padStart(9) +
    suffix;

  const lines = [
    `  scanning ${plan.bundles} bundle${plan.bundles === 1 ? '' : 's'}, ` +
      `${plan.revisions} revision${plan.revisions === 1 ? '' : 's'}`,
    row('reachable blobs:', plan.reachableBlobs),
    row(
      'unreferenced:',
      plan.unreferencedBlobs.length,
      `  (${formatBytes(bytesOf(plan.unreferencedBlobs))})`,
    ),
  ];
  if (plan.staleManifests.length > 0) {
    lines.push(
      row(
        'stale manifests:',
        plan.staleManifests.length,
        `  (${formatBytes(bytesOf(plan.staleManifests))})`,
      ),
    );
  }
  if (plan.skippedRecent > 0) {
    // Named rather than silently excluded: an operator who expects a number
    // to drop to zero and sees it plateau needs to know the sweep is holding
    // objects back on purpose.
    lines.push(row('too recent:', plan.skippedRecent));
  }

  const total = plan.unreferencedBlobs.length + plan.staleManifests.length;
  if (options.confirmed) {
    lines.push(
      `  deleted ${total} object${total === 1 ? '' : 's'} ` +
        `(${formatBytes(plan.bytes)})`,
    );
  } else {
    lines.push(pc.yellow('  DRY RUN — nothing deleted'));
    lines.push(pc.dim('  re-run with --confirm'));
  }
  return lines;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
