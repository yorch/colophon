import type { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

/**
 * Colophon's app-config surface.
 *
 * Backstage validates app-config against the schemas each package contributes
 * and silently drops any key no schema declares. Without this file a
 * misspelling under `colophon.*` produced a running system rather than an
 * error — `storage.local.directory` was read by the code as
 * `storage.local.root` for a while, so every publish succeeded, every read
 * 404'd, and nothing was logged.
 *
 * So this must describe what the code READS, not what the documentation
 * promises: `src/config.ts` and `src/storage/createBundleStorage.ts` are the
 * two places to keep it matched to. A key declared here but read nowhere is
 * as misleading as one read but not declared.
 */
export interface Config {
  colophon?: {
    /**
     * Where published bundles are read from. Omitted entirely, this is a
     * `local` store under ./colophon-storage — a development default, not a
     * deployment one.
     */
    storage?: {
      /**
       * @default "local"
       */
      type?: 'local' | 's3';

      local?: {
        /**
         * Resolved against the backend process's working directory, not
         * against app-config.yaml.
         *
         * @default "./colophon-storage"
         */
        directory?: string;
      };

      s3?: {
        /** Required when `type` is `s3`; startup fails without it. */
        bucket?: string;

        /** Key prefix, so one bucket can hold more than Colophon. */
        prefix?: string;

        region?: string;

        /**
         * An S3-compatible endpoint. Set this with `forcePathStyle` to run
         * against MinIO, Ceph RADOS Gateway, Cloudflare R2 or GCS rather than
         * AWS S3.
         */
        endpoint?: string;

        /** Path-style addressing, which most non-AWS endpoints require. */
        forcePathStyle?: boolean;

        /**
         * Omit this and the AWS SDK's default provider chain applies, which
         * is what an IRSA or instance-role deployment wants: no long-lived
         * key material in app-config at all.
         */
        credentials?: {
          /** @visibility secret */
          accessKeyId?: string;
          /** @visibility secret */
          secretAccessKey?: string;
        };
      };
    };

    retention?: {
      /**
       * Revisions kept per bundle beyond those a channel points at.
       *
       * @default 10
       */
      revisionsPerChannel?: number;
    };

    /**
     * Applied at index time, so changing these re-chunks on the next run
     * without any repository re-running its CI.
     */
    chunking?: {
      /**
       * Heading depths (1-6) that start a new chunk.
       *
       * @default [2, 3]
       */
      splitDepths?: number[];

      /**
       * Soft ceiling in characters; longer sections split on paragraphs.
       *
       * @default 1500
       */
      maxChars?: number;

      /**
       * Sections shorter than this merge into the following sibling.
       *
       * @default 200
       */
      minChars?: number;

      /**
       * Characters of the preceding chunk repeated for continuity.
       *
       * @default 0
       */
      overlapChars?: number;
    };

    /**
     * Both entries take the platform's standard schedule shape, so `seconds`,
     * `minutes`, `hours`, `days`, an ISO duration string and a cron
     * expression all behave here as they do anywhere else in Backstage.
     *
     * `frequency` and `timeout` are required once a task is named at all:
     * a half-specified schedule is a mistake worth failing on rather than
     * silently completing from the defaults.
     */
    schedule?: {
      /**
       * Re-reads the catalog for `brnby.io/colophon` annotations. Cheap, and
       * until it runs a newly annotated entity has no documentation tab.
       *
       * @default { frequency: { minutes: 10 }, timeout: { minutes: 5 }, initialDelay: { seconds: 15 } }
       */
      entityLinks?: SchedulerServiceTaskScheduleDefinitionConfig;

      /**
       * Projects documentation into Backstage Search. Expensive: it pages the
       * whole corpus over HTTP.
       *
       * @default { frequency: { minutes: 60 }, timeout: { minutes: 30 }, initialDelay: { seconds: 60 } }
       */
      searchIndex?: SchedulerServiceTaskScheduleDefinitionConfig;
    };
  };
}
