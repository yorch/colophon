import type { Options as SanitizeSchema } from 'rehype-sanitize';
import { defaultSchema } from 'rehype-sanitize';

/**
 * The sanitisation schema for Colophon markdown.
 *
 * Bundles are published from arbitrary repositories, so the rendered tree is
 * untrusted input. This schema is deliberately an EXTENSION of GitHub's
 * default allow-list rather than a replacement: it adds the three things the
 * renderer genuinely needs and nothing else. If a future feature needs another
 * tag or attribute, add it here.
 *
 * Not `rehype-raw`: react-markdown does put a page's raw HTML into the tree
 * as `raw` nodes, and this pass is what removes them. An adopter's rehype
 * plugins run afterwards, so a `rehype-raw` among them finds nothing to
 * expand — inert because of the ordering, not because raw HTML never arrives.
 * Moving anything ahead of this pass is what would reopen it, which is why
 * nothing is allowed to.
 */

const attributes = defaultSchema.attributes ?? {};

export const colophonSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...attributes,
    /**
     * `language-*` on fenced code is how the renderer routes a fence to a
     * language handler (Mermaid, say). The pattern is anchored so a crafted
     * class such as `language-x someOtherClass` cannot smuggle a second class
     * through.
     */
    code: [
      ...(attributes.code ?? []),
      ['className', /^language-[a-z0-9+#._-]*$/i],
    ],
    /** remark-gfm marks task-list items with this class. */
    li: [...(attributes.li ?? []), ['className', 'task-list-item']],
    /** remark-gfm renders task-list checkboxes as checked, disabled inputs. */
    input: [...(attributes.input ?? []), ['type', 'checkbox'], 'checked'],
  },
};

export type { SanitizeSchema };
