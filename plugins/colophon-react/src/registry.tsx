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

/**
 * The slot names, taken from the defaults so the two cannot disagree.
 *
 * Adding a slot means adding a default for it, which is what makes this the
 * authoritative list rather than a second one to keep in step.
 */
const SLOT_NAMES = Object.keys(defaultColophonComponents);

/** Warned-about names, so a re-render does not repeat itself. */
const warnedSlots = new Set<string>();

/**
 * A misspelled slot is otherwise completely silent.
 *
 * TypeScript rejects it, but the registry is a plain object and adopters cast
 * — through `as ColophonComponents`, through JSON config, through a helper
 * that widens the type. The override then sits in the merged object where
 * nothing ever reads it, and the only symptom is that the page renders
 * exactly as it did before. Naming the key costs one line and saves the hour
 * spent looking for the bug in the component instead.
 */
function warnAboutUnknownSlots(names: string[]): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  for (const name of names) {
    if (warnedSlots.has(name)) {
      continue;
    }
    warnedSlots.add(name);
    // eslint-disable-next-line no-console
    console.warn(
      `[colophon] Unknown component override "${name}" — ignored. ` +
        `Known slots: ${SLOT_NAMES.join(', ')}.`,
    );
  }
}

export function mergeComponents(
  base: ResolvedColophonComponents,
  overrides: ColophonComponents,
): ResolvedColophonComponents {
  const { codeLanguages, ...rest } = overrides;
  const entries = Object.entries(rest).filter(
    ([, value]) => value !== undefined,
  );
  const unknown = entries
    .map(([name]) => name)
    .filter(name => !SLOT_NAMES.includes(name));
  if (unknown.length > 0) {
    warnAboutUnknownSlots(unknown);
  }
  // Dropped rather than carried along inertly, so the warning's "ignored" is
  // literally what happens to them.
  const defined = Object.fromEntries(
    entries.filter(([name]) => SLOT_NAMES.includes(name)),
  );
  return {
    ...base,
    ...defined,
    // Language handlers merge key-by-key so registering `plantuml` does not
    // silently unregister `mermaid`.
    codeLanguages: { ...base.codeLanguages, ...codeLanguages },
  };
}
