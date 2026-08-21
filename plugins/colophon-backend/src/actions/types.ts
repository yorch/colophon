import type { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import type { ColophonService } from '../service/ColophonService';

export interface ColophonActionDeps {
  actionsRegistry: ActionsRegistryService;
  colophon: ColophonService;
  appBaseUrl: string;
}

/** Every action shares this pair, so one sentence explains it once. */
export const TARGET_HINT =
  'Identify the docs with exactly one of entityRef (preferred — the catalog ' +
  'ref you already have, e.g. "component:default/payments-api") or bundleId ' +
  '(e.g. "github.com/brnby/payments-api"), never both.';

export const CHANNEL_HINT =
  'Documentation channel, e.g. "latest" or "1.x". Omit for the bundle default; ' +
  'only pass one when the user asked about a specific release line.';
