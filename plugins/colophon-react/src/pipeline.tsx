import type { ComponentProps, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import type { SanitizeSchema } from './sanitizeSchema';

type MarkdownProps = ComponentProps<typeof Markdown>;

/**
 * A list of unified plugins, exactly as react-markdown accepts it.
 *
 * Spelled as an indexed access rather than importing `PluggableList` from
 * `unified`, which this package does not depend on directly — the type is
 * react-markdown's to define, and taking it from there is what keeps the two
 * from drifting.
 */
export type ColophonPluginList = NonNullable<MarkdownProps['remarkPlugins']>;

/** Pipeline additions, as a provider supplies them or a prop passes them. */
export interface ColophonPipeline {
  remarkPlugins?: ColophonPluginList;
  rehypePlugins?: ColophonPluginList;
  sanitizeSchema?: SanitizeSchema;
}

/**
 * The pipeline registry, and the reason it exists rather than being props
 * alone.
 *
 * `ColophonMarkdown` takes `remarkPlugins`, `rehypePlugins` and
 * `sanitizeSchema` as props, but nothing in the shipped frontend plugin
 * passes them: `DocsBrowser` renders the page and owns that call site. So for
 * anyone consuming `@brnby/plugin-colophon` rather than embedding the
 * renderer themselves, props alone would have made the whole feature
 * unreachable — an extension point that exists only for people who already
 * built their own shell.
 *
 * Context is how the component override registry already solves exactly this,
 * so this mirrors it: same install path, same nesting rule, nothing new to
 * learn.
 */
const ColophonPipelineContext = createContext<ColophonPipeline>({});

export interface ColophonPipelineProviderProps extends ColophonPipeline {
  children: ReactNode;
}

/**
 * Providers NEST rather than replace, matching
 * `ColophonComponentsProvider`: plugin lists concatenate outer-then-inner, and
 * a schema replaces the one above it. An app-wide provider adding admonitions
 * therefore survives a page-level provider adding something else.
 */
export function ColophonPipelineProvider({
  remarkPlugins,
  rehypePlugins,
  sanitizeSchema,
  children,
}: ColophonPipelineProviderProps) {
  const parent = useContext(ColophonPipelineContext);
  const value = useMemo<ColophonPipeline>(
    () =>
      mergePipelines(parent, { remarkPlugins, rehypePlugins, sanitizeSchema }),
    [parent, remarkPlugins, rehypePlugins, sanitizeSchema],
  );
  return (
    <ColophonPipelineContext.Provider value={value}>
      {children}
    </ColophonPipelineContext.Provider>
  );
}

/** Returns the ambient pipeline additions. */
export function useColophonPipeline(): ColophonPipeline {
  return useContext(ColophonPipelineContext);
}

export function mergePipelines(
  parent: ColophonPipeline,
  child: ColophonPipeline,
): ColophonPipeline {
  return {
    remarkPlugins: concat(parent.remarkPlugins, child.remarkPlugins),
    rehypePlugins: concat(parent.rehypePlugins, child.rehypePlugins),
    sanitizeSchema: child.sanitizeSchema ?? parent.sanitizeSchema,
  };
}

function concat(
  outer: ColophonPluginList | undefined,
  inner: ColophonPluginList | undefined,
): ColophonPluginList | undefined {
  if (!outer) {
    return inner;
  }
  if (!inner) {
    return outer;
  }
  return [...outer, ...inner];
}

/**
 * The two rehype plugins a caller must not name, and what happens if they do.
 *
 * `unified.use()` matches by attacher IDENTITY. Naming a plugin the pipeline
 * already runs does not append a second pass — it rewrites the existing entry
 * IN PLACE, merging the new options into it and leaving it at its original
 * position. So `rehypePlugins={[[rehypeSlug, { prefix: 'user-content-' }]]}`
 * reads as "also slug with a prefix" and means "reconfigure Colophon's own
 * slug pass", which is a different and much worse thing.
 *
 * There is no way to place a plugin BEFORE the sanitiser, and that is the
 * invariant this protects. It is also why `rehype-raw` in `rehypePlugins` is
 * harmless: the sanitiser has already dropped every `raw` node by the time an
 * appended plugin runs, so raw finds nothing to expand.
 */
const RESERVED_REHYPE_PLUGINS = new Map<unknown, string>([
  [
    rehypeSanitize,
    "rehype-sanitize is Colophon's sanitiser and the schema is a security " +
      'boundary; pass `sanitizeSchema` to widen it instead',
  ],
  [
    rehypeSlug,
    'rehype-slug gives headings the ids the manifest recorded as anchors; ' +
      'reconfiguring it makes every table-of-contents link on the page dead',
  ],
]);

/** Names already warned about, so a re-render does not repeat itself. */
const warnedReserved = new Set<unknown>();

/**
 * Rejects a caller plugin that would rewrite a built-in entry.
 *
 * Throws rather than warns when the entry carries options, because that is
 * the case that actually rewrites the built-in, the consequences are total
 * and silent, and it is a deterministic wiring mistake that fires on the
 * first render. A guard that only complained in a console would be the same
 * silence one step removed. It throws in production too: a check that fires
 * only in development is a landmine rather than a guard.
 *
 * An entry with NO options is genuinely inert — unified skips the merge when
 * there are no parameters — so it only warns. That distinction matters
 * because a bare `rehypeSlug` is half of the standard
 * `rehype-autolink-headings` recipe, which works here, and rejecting it would
 * break a correct setup to punish a redundant line.
 */
export function assertNoReservedPlugins(
  plugins: ColophonPluginList | undefined,
): void {
  for (const entry of plugins ?? []) {
    // `[plugin, ...options]` versus a nested list: unified tells them apart by
    // whether the first item is callable, so this does too.
    const isTuple = Array.isArray(entry) && typeof entry[0] === 'function';
    if (Array.isArray(entry) && !isTuple) {
      assertNoReservedPlugins(entry as ColophonPluginList);
      continue;
    }
    const attacher = isTuple ? entry[0] : entry;
    const reason = RESERVED_REHYPE_PLUGINS.get(attacher);
    if (!reason) {
      continue;
    }
    const name =
      attacher === rehypeSanitize ? 'rehype-sanitize' : 'rehype-slug';
    if (isTuple && entry.length > 1) {
      throw new Error(
        `[colophon] rehypePlugins may not pass options to ${name}. unified ` +
          "matches plugins by identity, so this rewrites Colophon's own " +
          `entry in place rather than adding a pass: ${reason}.`,
      );
    }
    if (!warnedReserved.has(attacher)) {
      warnedReserved.add(attacher);
      // eslint-disable-next-line no-console
      console.warn(
        `[colophon] rehypePlugins lists ${name}, which Colophon already ` +
          'runs. unified matches plugins by identity, so this entry does ' +
          'nothing at all — remove it. A plugin that must run after it, such ' +
          'as rehype-autolink-headings, already does.',
      );
    }
  }
}
