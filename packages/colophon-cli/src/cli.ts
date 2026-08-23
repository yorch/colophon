import { DEFAULT_CHANNEL } from '@brnby/colophon-common';
import { Command } from 'commander';
import pc from 'picocolors';
import { DEFAULT_MIN_AGE_MS, executeGc, planGc } from './gc';
import { build, hasErrors, upload } from './publish';
import { registerRevision } from './register';
import {
  formatDiagnostics,
  formatGcPlan,
  formatUpload,
  summarize,
} from './report';
import { deleteBundle, deleteChannel, listRetainedRevisions } from './retire';
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

  const publish = withStorageOptions(
    program
      .command('publish')
      .argument('<docsDir>', 'directory containing the documentation')
      .description('Publish the documentation as a new revision.')
      .requiredOption('--bundle-id <id>', 'bundle identifier')
      .option(
        '--channel <name>',
        'channel to point at this revision',
        DEFAULT_CHANNEL,
      ),
  );

  publish
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

  /**
   * Retiring, mirroring the two DELETE routes exactly.
   *
   * Same authentication as `publish` — `--backend-url` and `--token` — because
   * these run in the same place: the pipeline that opened a `pr-42` channel is
   * the one that should close it. There is no `--dry-run` here on purpose;
   * these are pointer deletions the backend performs immediately, and the
   * cautious step lives in `gc`, which is the command that touches bytes.
   */
  program
    .command('delete-channel')
    .argument('<bundleId>', 'bundle identifier')
    .argument('<channel>', 'channel to retire')
    .description('Retire a channel. Revisions it pinned become collectable.')
    .requiredOption('--backend-url <url>', 'Backstage backend')
    .option('--token <token>', 'bearer token for --backend-url')
    .action(
      async (
        bundleId: string,
        channel: string,
        options: { backendUrl: string; token?: string },
      ) => {
        const result = await deleteChannel({ ...options, bundleId, channel });
        io.out(`deleted channel ${pc.bold(channel)} of ${bundleId}`);
        const collected = result.revisionsCollected.length;
        if (collected > 0) {
          io.out(
            `retention collected ${collected} orphaned revision${
              collected === 1 ? '' : 's'
            }`,
          );
        }
      },
    );

  program
    .command('delete-bundle')
    .argument('<bundleId>', 'bundle identifier')
    .description('Retire a bundle: every channel, revision, page and chunk.')
    .requiredOption('--backend-url <url>', 'Backstage backend')
    .option('--token <token>', 'bearer token for --backend-url')
    .action(
      async (
        bundleId: string,
        options: { backendUrl: string; token?: string },
      ) => {
        const result = await deleteBundle({ ...options, bundleId });
        io.out(
          `deleted ${bundleId}: ${result.channelsDeleted} channels, ` +
            `${result.revisionsDeleted} revisions`,
        );
        io.out(
          pc.dim('run `colophon gc` to reclaim the storage they referenced'),
        );
      },
    );

  withStorageOptions(
    program
      .command('gc')
      .description(
        'Report objects no retained revision references. Deletes nothing without --confirm.',
      )
      .requiredOption('--backend-url <url>', 'Backstage backend')
      .option('--token <token>', 'bearer token for --backend-url')
      .option('--confirm', 'actually delete what the sweep found', false)
      .option(
        '--min-age-hours <hours>',
        'leave objects younger than this alone',
        String(DEFAULT_MIN_AGE_MS / 3_600_000),
      ),
  ).action(async (options: GcCommandOptions) => {
    const minAgeHours = Number(options.minAgeHours);
    if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
      throw new CliError('--min-age-hours must be a non-negative number');
    }
    const storage = createStorage(options);
    const plan = await planGc({
      storage,
      retained: () => listRetainedRevisions(options),
      minAgeMs: minAgeHours * 3_600_000,
    });
    if (options.confirm) {
      await executeGc({ storage, plan });
    }
    for (const line of formatGcPlan(plan, { confirmed: options.confirm })) {
      io.out(line);
    }
  });

  return program;
}

/**
 * The storage flags, in one place.
 *
 * `publish` writes through them and `gc` deletes through them, and the two
 * must address the same objects — an `--s3-prefix` supported on one side only
 * means a sweep that reports the entire corpus as unreferenced.
 */
function withStorageOptions(command: Command): Command {
  return command
    .option('--storage <kind>', 'local or s3', 'local')
    .option(
      '--local-dir <path>',
      'root directory when --storage local',
      './colophon-storage',
    )
    .option('--s3-bucket <name>', 'bucket when --storage s3')
    .option('--s3-region <name>', 'region when --storage s3')
    .option('--s3-prefix <path>', 'key prefix; must match the backend config')
    .option('--s3-endpoint <url>', 'custom endpoint for MinIO, R2 and similar')
    .option('--s3-force-path-style', 'path-style addressing, for MinIO', false);
}

interface GcCommandOptions {
  backendUrl: string;
  token?: string;
  confirm: boolean;
  minAgeHours: string;
  storage: string;
  localDir: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
}

interface PublishCommandOptions {
  bundleId: string;
  channel: string;
  storage: string;
  localDir: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
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
  s3Prefix?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
}): BundleStorage {
  if (options.storage === 's3') {
    if (!options.s3Bucket) {
      throw new CliError('--s3-bucket is required when --storage s3');
    }
    return new S3BundleStorage({
      bucket: options.s3Bucket,
      region: options.s3Region,
      prefix: options.s3Prefix,
      endpoint: options.s3Endpoint,
      forcePathStyle: options.s3ForcePathStyle,
    });
  }
  if (options.storage !== 'local') {
    throw new CliError(
      `unknown --storage "${options.storage}", expected local or s3`,
    );
  }
  return new LocalBundleStorage(options.localDir);
}
