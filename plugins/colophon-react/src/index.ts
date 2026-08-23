/**
 * The shared Colophon rendering surface.
 *
 * This package holds the markdown renderer and its extension points, so that
 * the entity docs tab, the docs home page, and anything an adopter builds all
 * render the same way and are restyled in the same place.
 */

export type { ColophonMarkdownProps } from './components/ColophonMarkdown';
export { ColophonMarkdown } from './components/ColophonMarkdown';
export type { ColophonNavProps } from './components/ColophonNav';
export { ColophonNav } from './components/ColophonNav';
export type { ColophonPageHeaderProps } from './components/ColophonPageHeader';
export { ColophonPageHeader } from './components/ColophonPageHeader';
export type {
  ColophonSearchResult,
  ColophonSearchResultsProps,
} from './components/ColophonSearchResults';
export { ColophonSearchResults } from './components/ColophonSearchResults';
export type { ColophonTocProps } from './components/ColophonToc';
export { ColophonToc } from './components/ColophonToc';
export { MermaidDiagram } from './components/MermaidDiagram';
export {
  defaultCodeLanguages,
  defaultColophonComponents,
} from './defaultComponents';
export type {
  ColophonPipeline,
  ColophonPipelineProviderProps,
  ColophonPluginList,
} from './pipeline';
export {
  ColophonPipelineProvider,
  useColophonPipeline,
} from './pipeline';
export type { ColophonComponentsProviderProps } from './registry';
export {
  ColophonComponentsProvider,
  useColophonComponents,
} from './registry';
export type { SanitizeSchema } from './sanitizeSchema';
export { colophonSanitizeSchema } from './sanitizeSchema';
export {
  COLOPHON_STYLE_ELEMENT_ID,
  COLOPHON_STYLE_LAYER,
  ensureColophonStyles,
  useColophonStyles,
} from './styles';
export type {
  BlockquoteProps,
  CodeBlockProps,
  CodeProps,
  ColophonComponents,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListItemProps,
  ListProps,
  ParagraphProps,
  ResolvedColophonComponents,
  TableCellProps,
  TableHeadProps,
  TableProps,
  TableRowProps,
} from './types';
export type { AnchorScrollOptions } from './useAnchorScroll';
export { useAnchorScroll } from './useAnchorScroll';
export type { ContainerWidth } from './useContainerWidth';
export { useContainerWidth } from './useContainerWidth';
