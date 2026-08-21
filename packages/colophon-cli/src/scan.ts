import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import {
  DOCS_CONFIG_FILENAMES,
  type DocsConfig,
  docStatusSchema,
  docTypeSchema,
  parseDocsConfig,
  slugFromPath,
  splitFrontmatter,
} from '@brnby/colophon-common';
import fg from 'fast-glob';
import { parse as parseYaml } from 'yaml';
import { humanize } from './humanize';
import { parsePage } from './markdown';
import { mediaTypeFor } from './mediaType';
import type { AssetDraft, PageDraft } from './types';

export interface ScanResult {
  config: DocsConfig;
  pages: PageDraft[];
  assets: AssetDraft[];
}

/** Never published: editor droppings and the config file itself. */
const ALWAYS_EXCLUDED = ['**/node_modules/**', '**/.*/**', '**/.*'];

export async function readDocsConfig(docsDir: string): Promise<DocsConfig> {
  for (const filename of DOCS_CONFIG_FILENAMES) {
    try {
      const raw = await readFile(`${docsDir}/${filename}`, 'utf8');
      return parseDocsConfig(parseYaml(raw) ?? {});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          `Failed to read ${filename}: ${(error as Error).message}`,
        );
      }
    }
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

  const pages: PageDraft[] = [];
  const assets: AssetDraft[] = [];

  for (const path of entries) {
    if (DOCS_CONFIG_FILENAMES.includes(basename(path) as never)) {
      continue;
    }
    const bytes = await readFile(`${docsDir}/${path}`);
    if (/\.mdx?$/i.test(path)) {
      pages.push(toPageDraft(path, bytes));
    } else {
      assets.push({ path, mediaType: mediaTypeFor(path), bytes });
    }
  }

  return { config, pages, assets };
}

function toPageDraft(path: string, rawBytes: Buffer): PageDraft {
  // Frontmatter boundaries come from the contract rather than from a parser
  // of our own choosing, so the body we validate anchors against is byte for
  // byte the body the backend chunks.
  const { frontmatter, body } = splitFrontmatter(rawBytes.toString('utf8'));
  const data = parseFrontmatterData(frontmatter);
  const { headings, references } = parsePage(body);

  return {
    path,
    slug: slugFromPath(path),
    title: resolveTitle(path, data.title, headings[0]),
    description: optionalString(data.description),
    type: docTypeSchema.optional().parse(data.type ?? undefined),
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
