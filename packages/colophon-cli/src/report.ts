import pc from 'picocolors';
import type { UploadStats } from './publish';
import type { Diagnostic } from './types';

export function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map(diagnostic => {
    const label =
      diagnostic.level === 'error' ? pc.red('error') : pc.yellow('warning');
    const where = diagnostic.path ? `${pc.dim(diagnostic.path)}: ` : '';
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
