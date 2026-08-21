import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { defaultColophonComponents } from './defaultComponents';
import type { ColophonComponents, ResolvedColophonComponents } from './types';

/**
 * The component override registry.
 *
 * Providers NEST rather than replace: an inner provider that overrides `link`
 * keeps the outer provider's `code`. That is what lets an app set portal-wide
 * defaults while a single page still swaps one component.
 */
const ColophonComponentsContext = createContext<ResolvedColophonComponents>(
  defaultColophonComponents,
);

export interface ColophonComponentsProviderProps {
  components: ColophonComponents;
  children: ReactNode;
}

export function ColophonComponentsProvider({
  components,
  children,
}: ColophonComponentsProviderProps) {
  const parent = useContext(ColophonComponentsContext);
  const value = useMemo<ResolvedColophonComponents>(
    () => mergeComponents(parent, components),
    [parent, components],
  );
  return (
    <ColophonComponentsContext.Provider value={value}>
      {children}
    </ColophonComponentsContext.Provider>
  );
}

/** Returns the active renderer components, with every default filled in. */
export function useColophonComponents(): ResolvedColophonComponents {
  return useContext(ColophonComponentsContext);
}

export function mergeComponents(
  base: ResolvedColophonComponents,
  overrides: ColophonComponents,
): ResolvedColophonComponents {
  const { codeLanguages, ...rest } = overrides;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  return {
    ...base,
    ...defined,
    // Language handlers merge key-by-key so registering `plantuml` does not
    // silently unregister `mermaid`.
    codeLanguages: { ...base.codeLanguages, ...codeLanguages },
  };
}
