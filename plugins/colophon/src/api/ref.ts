import { createApiRef } from '@backstage/core-plugin-api';
import type { ColophonApi } from './types';

export const colophonApiRef = createApiRef<ColophonApi>({
  id: 'plugin.colophon.service',
});
