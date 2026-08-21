import { registerGetPageAction } from './getPage';
import { registerListEntitiesAction } from './listEntities';
import { registerListPagesAction } from './listPages';
import { registerSearchAction } from './search';
import type { ColophonActionDeps } from './types';

/**
 * Registers the four MCP actions. All are read-only and idempotent — nothing
 * an agent can call here mutates a bundle, a channel, or the index.
 */
export function registerColophonActions(deps: ColophonActionDeps): void {
  registerSearchAction(deps);
  registerGetPageAction(deps);
  registerListPagesAction(deps);
  registerListEntitiesAction(deps);
}

export type { ColophonActionDeps } from './types';
