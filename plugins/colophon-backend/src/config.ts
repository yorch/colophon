import type { RootConfigService } from '@backstage/backend-plugin-api';
import {
  type ChunkingOptions,
  chunkingOptionsSchema,
} from '@brnby/colophon-common';

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
  /** How often published revisions are ingested and re-indexed. */
  schedule: {
    frequency: { minutes: number };
    timeout: { minutes: number };
    initialDelay: { seconds: number };
  };
}

export const DEFAULT_SCHEDULE = {
  frequency: { minutes: 10 },
  timeout: { minutes: 15 },
  initialDelay: { seconds: 30 },
} as const;

export const DEFAULT_REVISIONS_PER_CHANNEL = 10;

export function readColophonConfig(config: RootConfigService): ColophonConfig {
  const root = config.getOptionalConfig('colophon');
  const chunking = root?.getOptionalConfig('chunking');
  const schedule = root?.getOptionalConfig('schedule');
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
    schedule: {
      frequency: {
        minutes:
          schedule?.getOptionalNumber('frequency.minutes') ??
          DEFAULT_SCHEDULE.frequency.minutes,
      },
      timeout: {
        minutes:
          schedule?.getOptionalNumber('timeout.minutes') ??
          DEFAULT_SCHEDULE.timeout.minutes,
      },
      initialDelay: {
        seconds:
          schedule?.getOptionalNumber('initialDelay.seconds') ??
          DEFAULT_SCHEDULE.initialDelay.seconds,
      },
    },
  };
}
