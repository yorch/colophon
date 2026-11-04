import { useColophonStyles } from '../styles';

export interface ColophonSkeletonProps {
  /**
   * `page` is a title plus paragraphs, `nav` a column of link-sized rows, and
   * `layout` both inside the same grid the real page uses — so the space is
   * already the right shape when content arrives, instead of a bar that
   * snaps to a layout.
   */
  variant?: 'page' | 'nav' | 'layout';
  /** Spoken in place of the (meaningless) grey shapes. */
  label?: string;
}

const NAV_ROWS = [0, 1, 2, 3, 4, 5];
const BODY_LINES = ['100%', '94%', '88%', '100%', '72%'];

function PageShape() {
  return (
    <div className="colophon-skeleton-page">
      <div className="colophon-skeleton colophon-skeleton-title" />
      {BODY_LINES.map((width, index) => (
        <div
          // Fixed, decorative and never reordered, so index is a safe key.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          className="colophon-skeleton colophon-skeleton-line"
          style={{ width }}
        />
      ))}
      <div className="colophon-skeleton colophon-skeleton-block" />
    </div>
  );
}

function NavShape() {
  return (
    <div className="colophon-skeleton-nav">
      {NAV_ROWS.map(row => (
        <div
          key={row}
          className="colophon-skeleton colophon-skeleton-line"
          style={{ width: row % 3 === 0 ? '60%' : '85%' }}
        />
      ))}
    </div>
  );
}

/**
 * A loading placeholder that is announced.
 *
 * Loading used to be inferred from a message ending in an ellipsis, and the
 * shapes were near-invisible and silent. This is an explicit, labelled
 * `status` region: `aria-busy` tells assistive technology the content is not
 * ready, and the label says what is being waited for.
 */
export function ColophonSkeleton({
  variant = 'page',
  label = 'Loading documentation',
}: ColophonSkeletonProps) {
  useColophonStyles();
  const shapes =
    variant === 'nav' ? (
      <NavShape />
    ) : variant === 'page' ? (
      <PageShape />
    ) : (
      <div className="colophon-layout-container">
        <div className="colophon-layout">
          <div className="colophon-layout-nav">
            <NavShape />
          </div>
          <div className="colophon-layout-main">
            <PageShape />
          </div>
        </div>
      </div>
    );
  return (
    <div role="status" aria-busy="true" className="colophon-skeleton-root">
      <span className="colophon-visually-hidden">{label}</span>
      <div aria-hidden="true">{shapes}</div>
    </div>
  );
}
