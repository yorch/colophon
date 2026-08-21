import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import {
  DOCS_CONFIG_FILENAMES,
  type DocsConfig,
  type DocType,
  docStatusSchema,
  docsConfigSchema,
  docTypeSchema,
  parseDocsConfig,
  slugFromPath,
  splitFrontmatter,
} from '@brnby/colophon-common';
import fg from 'fast-glob';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { humanize } from './humanize';
import { parsePage } from './markdown';
import { mediaTypeFor } from './mediaType';
import type { AssetDraft, Diagnostic, PageDraft } from './types';

export interface ScanResult {
  config: DocsConfig;
  pages: PageDraft[];
  assets: AssetDraft[];
  /** Problems with the scan itself, as opposed to with the content. */
  diagnostics: Diagnostic[];
}

/** Never published: editor droppings and the config file itself. */
const ALWAYS_EXCLUDED = ['**/node_modules/**', '**/.*/**', '**/.*'];

export async function readDocsConfig(docsDir: string): Promise<DocsConfig> {
  for (const filename of DOCS_CONFIG_FILENAMES) {
    let raw: string;
    try {
      raw = await readFile(`${docsDir}/${filename}`, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw new Error(
        `Could not read ${filename}: ${(error as Error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw) ?? {};
    } catch (error) {
      // The YAML parser's own message names the line and column, which is
      // more use than anything this layer could add.
      throw new Error(
        `${filename} is not valid YAML: ${(error as Error).message}`,
      );
    }

    const result = docsConfigSchema.safeParse(parsed);
    if (!result.success) {
      // docs.yaml is written by hand by people who will never read this
      // source, so the message has to stand on its own. Raw zod output —
      // a JSON array of issue objects — does not.
      throw new Error(
        `${filename} is not valid:\n${z.prettifyError(result.error)}`,
      );
    }
    return result.data;
  }
  // Absent is the common case, not an error — conventions are the default.
  return parseDocsConfig({});
}

/**
 * Reads a docs directory into pages and assets.
 *
 * Markdown is a page and everything else is an asset, rather than matching an
 * allow-list of extensions: documentation references spreadsheets, archives
 * and fonts often enough that an allow-list becomes a support burden.
 */
export async function scan(docsDir: string): Promise<ScanResult> {
  // fast-glob returns [] for a directory that does not exist rather than
  // throwing, and every downstream check iterates an empty array happily. A
  // mistyped path would therefore publish an empty bundle and repoint the
  // channel at it — deleting a repository's documentation from the portal on
  // a green CI run. This is the only layer that can still tell "missing"
  // from "empty", so it must not discard the distinction.
  const stats = await stat(docsDir).catch(() => undefined);
  if (!stats) {
    throw new Error(`Documentation directory "${docsDir}" does not exist`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`"${docsDir}" is not a directory`);
  }

  const config = await readDocsConfig(docsDir);
  const exclude = [...ALWAYS_EXCLUDED, ...config.exclude];

  const entries = await fg('**/*', {
    cwd: docsDir,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
  });
  entries.sort();

  const diagnostics = await checkExcludePatterns(docsDir, config.exclude);

  const pages: PageDraft[] = [];
  const assets: AssetDraft[] = [];

  for (const path of entries) {
    // Only the config file at the ROOT is ours. Matching by basename at any
    // depth quietly refuses to publish a page about docs.yaml — which, in a
    // repository whose documentation covers its own tooling, is exactly the
    // page someone will write.
    if (DOCS_CONFIG_FILENAMES.includes(path as never)) {
      continue;
    }
    const bytes = await readFile(`${docsDir}/${path}`);
    if (/\.mdx?$/i.test(path)) {
      pages.push(toPageDraft(path, bytes, config.defaultType));
    } else {
      assets.push({ path, mediaType: mediaTypeFor(path), bytes });
    }
  }

  return { config, pages, assets, diagnostics };
}

/**
 * Reports exclude patterns that match nothing.
 *
 * An exclude that silently does nothing is indistinguishable from one that
 * works, and the two failures it hides point in opposite directions: a
 * leading slash (`/drafts/**`) excludes nothing, so drafts get published,
 * while a pattern that is broader than intended excludes everything. Only the
 * second is loud on its own — the first is a green build that publishes what
 * the author asked to withhold.
 *
 * Advisory rather than fatal because a pattern can legitimately match nothing
 * today: a repository may carry a shared docs.yaml that excludes `drafts/**`
 * in every component, most of which have no drafts.
 */
async function checkExcludePatterns(
  docsDir: string,
  patterns: string[],
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const pattern of patterns) {
    const matches = await fg(pattern, {
      cwd: docsDir,
      onlyFiles: true,
      dot: false,
    });
    if (matches.length === 0) {
      diagnostics.push({
        level: 'warning',
        message: `exclude pattern "${pattern}" matches no files${
          pattern.startsWith('/')
            ? '; patterns are relative to the docs root, so the leading slash is why'
            : ''
        }`,
        path: 'docs.yaml',
      });
    }
  }
  return diagnostics;
}

function toPageDraft(
  path: string,
  rawBytes: Buffer,
  defaultType: DocType | undefined,
): PageDraft {
  // Frontmatter boundaries come from the contract rather than from a parser
  // of our own choosing, so the body we validate anchors against is byte for
  // byte the body the backend chunks.
  const raw = rawBytes.toString('utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const data = parseFrontmatterData(frontmatter);
  // How many lines the frontmatter took, so reported positions are lines in
  // the FILE rather than lines in the body the parser saw.
  const lineOffset =
    raw.slice(0, raw.length - body.length).split('\n').length - 1;
  const { headings, references } = parsePage(body, lineOffset);

  return {
    path,
    slug: slugFromPath(path),
    title: resolveTitle(path, data.title, headings[0]),
    description: optionalString(data.description),
    // The page's own frontmatter wins; docs.yaml supplies the fallback for a
    // repository whose docs are all one Diataxis type, which is the case the
    // setting exists for.
    type: docTypeSchema.optional().parse(data.type ?? defaultType ?? undefined),
    status: docStatusSchema.parse(data.status ?? 'current'),
    tags: toStringArray(data.tags),
    navOrder: typeof data.nav_order === 'number' ? data.nav_order : undefined,
    headings,
    references,
    rawBytes,
    body,
  };
}

/**
 * Frontmatter must be a YAML mapping. Anything else — a list, a scalar, a
 * syntax error — is reported as an empty mapping rather than thrown, so one
 * malformed page degrades to "no metadata" instead of failing the publish
 * before the validator can say which page is at fault.
 */
function parseFrontmatterData(
  frontmatter: string | undefined,
): Record<string, unknown> {
  if (!frontmatter?.trim()) {
    return {};
  }
  try {
    const parsed = parseYaml(frontmatter);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Frontmatter, then the first H1, then the filename. */
function resolveTitle(
  path: string,
  frontmatter: unknown,
  firstHeading: { depth: number; text: string } | undefined,
): string {
  const explicit = optionalString(frontmatter);
  if (explicit) {
    return explicit;
  }
  if (firstHeading?.depth === 1 && firstHeading.text) {
    return firstHeading.text;
  }
  const name = basename(path, extname(path));
  return humanize(
    name === 'index' ? basename(path.replace(/\/?[^/]*$/, '')) || 'Home' : name,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}
