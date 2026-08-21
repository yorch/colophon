import type { RootConfigService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import {
  type ChunkingOptions,
  chunkingOptionsSchema,
} from './indexing/options';

export interface ColophonConfig {
  chunking: ChunkingOptions;
  retention: {
    /**
     * Revisions kept per bundle beyond those a channel points at.
     *
     * Named for channels because that is how operators think about it — "keep
     * ten builds of each release line" — but enforced per bundle, because a
     * channel is a single pointer and carries no history of its own.
     */
    revisionsPerChannel: number;
  };
  /** Base URL of the portal, used to build citable deep links. */
  appBaseUrl: string;
  /**
   * How often the catalog is re-read for `brnby.io/colophon` annotations.
   *
   * Cheap: one filtered catalog query and a small table rewrite. It wants to
   * be frequent, because until it runs a newly annotated entity has no
   * documentation tab.
   */
  entityLinkSchedule: TaskSchedule;
  /**
   * How often documentation is projected into Backstage Search.
   *
   * Expensive: it pages the entire corpus over HTTP. It wants to be far less
   * frequent than the link sync.
   *
   * These were one key until it became clear that a value suiting either one
   * badly misfits the other, and that the key's own comment described a third
   * thing — ingestion — which is synchronous inside setChannel and not
   * scheduled at all.
   */
  searchIndexSchedule: TaskSchedule;
}

export interface TaskSchedule {
  frequency: { minutes: number };
  timeout: { minutes: number };
  initialDelay: { seconds: number };
}

export const DEFAULT_ENTITY_LINK_SCHEDULE: TaskSchedule = {
  frequency: { minutes: 10 },
  timeout: { minutes: 5 },
  initialDelay: { seconds: 15 },
};

export const DEFAULT_SEARCH_INDEX_SCHEDULE: TaskSchedule = {
  frequency: { minutes: 60 },
  timeout: { minutes: 30 },
  initialDelay: { seconds: 60 },
};

export const DEFAULT_REVISIONS_PER_CHANNEL = 10;

export function readColophonConfig(config: RootConfigService): ColophonConfig {
  const root = config.getOptionalConfig('colophon');
  const chunking = root?.getOptionalConfig('chunking');
  return {
    chunking: chunkingOptionsSchema.parse({
      // Config has no number-array accessor, so read the raw value and let
      // zod do the validating — which it must anyway, for the depth range.
      splitDepths: chunking?.getOptional('splitDepths'),
      maxChars: chunking?.getOptionalNumber('maxChars'),
      minChars: chunking?.getOptionalNumber('minChars'),
      overlapChars: chunking?.getOptionalNumber('overlapChars'),
    }),
    retention: {
      revisionsPerChannel:
        root?.getOptionalNumber('retention.revisionsPerChannel') ??
        DEFAULT_REVISIONS_PER_CHANNEL,
    },
    appBaseUrl: config.getString('app.baseUrl'),
    entityLinkSchedule: readSchedule(
      root?.getOptionalConfig('schedule.entityLinks'),
      DEFAULT_ENTITY_LINK_SCHEDULE,
    ),
    searchIndexSchedule: readSchedule(
      root?.getOptionalConfig('schedule.searchIndex'),
      DEFAULT_SEARCH_INDEX_SCHEDULE,
    ),
  };
}

function readSchedule(
  config: Config | undefined,
  fallback: TaskSchedule,
): TaskSchedule {
  return {
    frequency: {
      minutes:
        config?.getOptionalNumber('frequency.minutes') ??
        fallback.frequency.minutes,
    },
    timeout: {
      minutes:
        config?.getOptionalNumber('timeout.minutes') ??
        fallback.timeout.minutes,
    },
    initialDelay: {
      seconds:
        config?.getOptionalNumber('initialDelay.seconds') ??
        fallback.initialDelay.seconds,
    },
  };
}
