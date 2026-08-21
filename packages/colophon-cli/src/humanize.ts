/**
 * Turns a filename or directory segment into a readable nav title, e.g.
 * `getting-started` -> `Getting Started`. The last resort in the title
 * fallback chain (frontmatter -> first H1 -> this), and also used for a
 * directory group header that has no `index.md` of its own.
 */
export function humanize(segment: string): string {
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
