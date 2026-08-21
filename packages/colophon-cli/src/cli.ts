import { DEFAULT_CHANNEL } from '@brnby/colophon-common';
import { Command } from 'commander';
import pc from 'picocolors';
import { build, hasErrors, upload } from './publish';
import { registerRevision } from './register';
import { formatDiagnostics, formatUpload, summarize } from './report';
import {
  type BundleStorage,
  LocalBundleStorage,
  S3BundleStorage,
} from './storage';

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  // eslint-disable-next-line no-console
  out: line => console.log(line),
  // eslint-disable-next-line no-console
  err: line => console.error(line),
};

export function createCli(io: CliIo = defaultIo): Command {
  const program = new Command();

  program
    .name('colophon')
    .description('Publish a docs directory as a Colophon bundle.')
    .exitOverride();

  program
    .command('validate')
    .argument('<docsDir>', 'directory containing the documentation')
    .description('Scan and validate without uploading anything.')
    .option('--strict', 'treat advisory diagnostics as errors', false)
    .action(async (docsDir: string, options: { strict: boolean }) => {
      const result = await build({
        docsDir,
        bundleId: 'validate.local/placeholder',
        // Validation never leaves the machine, so the source fields exist
        // only to satisfy the manifest schema.
        source: { url: 'local', ref: 'local', commit: 'local' },
        strict: options.strict,
      });

      for (const line of formatDiagnostics(result.diagnostics)) {
        io.err(line);
      }
      io.out(
        summarize({
          pages: result.pages.length,
          assets: result.assets.length,
          diagnostics: result.diagnostics,
        }),
      );

      if (hasErrors(result.diagnostics)) {
        throw new CliError('validation failed');
      }
    });

  program
    .command('publish')
    .argument('<docsDir>', 'directory containing the documentation')
    .description('Publish the documentation as a new revision.')
    .requiredOption('--bundle-id <id>', 'bundle identifier')
    .option(
      '--channel <name>',
      'channel to point at this revision',
      DEFAULT_CHANNEL,
    )
    .option('--storage <kind>', 'local or s3', 'local')
    .option(
      '--local-dir <path>',
      'root directory when --storage local',
      './colophon-storage',
    )
    .option('--s3-bucket <name>', 'bucket when --storage s3')
    .option('--s3-region <name>', 'region when --storage s3')
    .option('--source-url <url>', 'repository URL', '')
    .option('--source-ref <ref>', 'branch or tag', '')
    .option('--source-commit <sha>', 'commit sha', '')
    .option('--source-path <path>', 'docs path within the repository', 'docs')
    .option(
      '--backend-url <url>',
      'Backstage backend to register the revision with',
    )
    .option('--token <token>', 'bearer token for --backend-url')
    .option('--publisher <name>', 'who is publishing', 'colophon-cli')
    .option('--run-url <url>', 'link back to the CI run')
    .option('--strict', 'treat advisory diagnostics as errors', false)
    .option('--dry-run', 'build and validate, but upload nothing', false)
    .action(async (docsDir: string, options: PublishCommandOptions) => {
      const result = await build({
        docsDir,
        bundleId: options.bundleId,
        source: {
          url: options.sourceUrl,
          ref: options.sourceRef,
          commit: options.sourceCommit,
          path: options.sourcePath,
        },
        publisher: { name: options.publisher, runUrl: options.runUrl },
        strict: options.strict,
      });

      for (const line of formatDiagnostics(result.diagnostics)) {
        io.err(line);
      }
      io.out(
        summarize({
          pages: result.pages.length,
          assets: result.assets.length,
          diagnostics: result.diagnostics,
        }),
      );

      if (hasErrors(result.diagnostics)) {
        throw new CliError('validation failed, nothing was published');
      }

      io.out(`revision ${pc.bold(result.manifest.revisionId.slice(0, 12))}`);

      if (options.dryRun) {
        io.out(pc.dim('dry run, nothing uploaded'));
        return;
      }

      const stats = await upload({
        manifest: result.manifest,
        pages: result.pages,
        assets: result.assets,
        storage: createStorage(options),
      });
      io.out(formatUpload(stats));

      if (options.backendUrl) {
        await registerRevision({
          backendUrl: options.backendUrl,
          bundleId: options.bundleId,
          revisionId: result.manifest.revisionId,
          channel: options.channel,
          token: options.token,
        });
        io.out(
          `channel ${pc.bold(options.channel)} now points at this revision`,
        );
      }
    });

  return program;
}

interface PublishCommandOptions {
  bundleId: string;
  channel: string;
  storage: string;
  localDir: string;
  s3Bucket?: string;
  s3Region?: string;
  sourceUrl: string;
  sourceRef: string;
  sourceCommit: string;
  sourcePath: string;
  backendUrl?: string;
  token?: string;
  publisher: string;
  runUrl?: string;
  strict: boolean;
  dryRun: boolean;
}

export class CliError extends Error {}

export function createStorage(options: {
  storage: string;
  localDir: string;
  s3Bucket?: string;
  s3Region?: string;
}): BundleStorage {
  if (options.storage === 's3') {
    if (!options.s3Bucket) {
      throw new CliError('--s3-bucket is required when --storage s3');
    }
    return new S3BundleStorage({
      bucket: options.s3Bucket,
      region: options.s3Region,
    });
  }
  if (options.storage !== 'local') {
    throw new CliError(
      `unknown --storage "${options.storage}", expected local or s3`,
    );
  }
  return new LocalBundleStorage(options.localDir);
}
