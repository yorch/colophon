import {
  type RootConfigService,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  type SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { DEFAULT_APP_PATH, normalizeAppPath } from '@brnby/colophon-common';
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
   * Where the frontend mounts the docs home page, normalised.
   *
   * The backend has no router, so it cannot discover this the way the docs
   * home page does — and it is the half that writes every search result
   * location and every URL handed to an agent. An app that remaps the page
   * with `page:colophon: { config: { path: /handbook } }` and leaves this
   * alone gets links that 404, which is why the frontend warns when the two
   * disagree rather than leaving it to be found by clicking.
   */
  appPath: string;
  /**
   * How often the catalog is re-read for `brnby.io/colophon` annotations.
   *
   * Cheap: one filtered catalog query and a small table rewrite. It wants to
   * be frequent, because until it runs a newly annotated entity has no
   * documentation tab.
   */
  entityLinkSchedule: SchedulerServiceTaskScheduleDefinition;
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
  searchIndexSchedule: SchedulerServiceTaskScheduleDefinition;
}

export const DEFAULT_ENTITY_LINK_SCHEDULE: SchedulerServiceTaskScheduleDefinition =
  {
    frequency: { minutes: 10 },
    timeout: { minutes: 5 },
    initialDelay: { seconds: 15 },
  };

export const DEFAULT_SEARCH_INDEX_SCHEDULE: SchedulerServiceTaskScheduleDefinition =
  {
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
    // Normalised here and nowhere else, so `/handbook/` and `handbook` become
    // one value before anything compares or concatenates it.
    appPath: normalizeAppPath(
      root?.getOptionalString('appPath') ?? DEFAULT_APP_PATH,
    ),
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

/**
 * Delegates to the platform reader rather than picking the units apart here.
 *
 * The hand-rolled version this replaces read `frequency.minutes` and nothing
 * else, so `frequency: { seconds: 30 }` — valid everywhere else in Backstage
 * — was dropped and the default silently applied instead. Anything the
 * platform accepts now works: `seconds`, `minutes`, `hours`, `days`, an ISO
 * duration string, or a cron expression.
 *
 * A declared block must carry both `frequency` and `timeout`, which is where
 * the platform reader throws. That is deliberate: half a schedule is a
 * mistake, and completing it from the defaults is how the original bug hid.
 */
function readSchedule(
  config: Config | undefined,
  fallback: SchedulerServiceTaskScheduleDefinition,
): SchedulerServiceTaskScheduleDefinition {
  return config
    ? readSchedulerServiceTaskScheduleDefinitionFromConfig(config)
    : fallback;
}
