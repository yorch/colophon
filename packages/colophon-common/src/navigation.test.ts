import type { NavNode } from './manifest';
import { scopeNavigation } from './navigation';

const tree: NavNode[] = [
  { title: 'Home', slug: '' },
  {
    title: 'Services',
    children: [
      {
        title: 'Billing',
        slug: 'services/billing',
        children: [
          { title: 'API', slug: 'services/billing/api' },
          { title: 'Ops', slug: 'services/billing/ops' },
        ],
      },
      { title: 'Payments', slug: 'services/payments' },
    ],
  },
];

describe('scopeNavigation', () => {
  it('returns the tree untouched when there is no subpath', () => {
    expect(scopeNavigation(tree)).toBe(tree);
  });

  it('returns the children of an exactly matching node', () => {
    // A tab scoped to billing should list billing's pages, not the whole
    // tree pruned down with two ancestor groups still above it.
    expect(scopeNavigation(tree, 'services/billing').map(n => n.slug)).toEqual([
      'services/billing/api',
      'services/billing/ops',
    ]);
  });

  it('returns the node itself when it has no children', () => {
    expect(scopeNavigation(tree, 'services/payments')).toEqual([
      { title: 'Payments', slug: 'services/payments' },
    ]);
  });

  it('excludes a sibling that merely shares a prefix', () => {
    const shared: NavNode[] = [
      { title: 'Billing', slug: 'services/billing' },
      { title: 'Billing v2', slug: 'services/billing-v2' },
    ];
    expect(scopeNavigation(shared, 'services/billing')).toEqual([
      { title: 'Billing', slug: 'services/billing' },
    ]);
  });

  describe('when no node addresses the subpath', () => {
    // A docs.yaml nav can group pages differently, or a subpath can name a
    // directory with no index page. Returning nothing would hide docs that
    // exist.
    const noIndex: NavNode[] = [
      { title: 'Home', slug: '' },
      {
        title: 'Services',
        children: [
          { title: 'API', slug: 'services/billing/api' },
          { title: 'Other', slug: 'services/other' },
        ],
      },
    ];

    it('prunes to the in-scope pages instead of returning nothing', () => {
      const scoped = scopeNavigation(noIndex, 'services/billing');
      expect(scoped).toHaveLength(1);
      expect(scoped[0].children?.map(n => n.slug)).toEqual([
        'services/billing/api',
      ]);
    });

    it('keeps an out-of-scope group as a header without a link', () => {
      const [group] = scopeNavigation(noIndex, 'services/billing');
      expect(group.title).toBe('Services');
      expect(group.slug).toBeUndefined();
    });

    it('drops branches with nothing in scope', () => {
      expect(scopeNavigation(noIndex, 'nothing/here')).toEqual([]);
    });
  });

  it('never mutates the tree it was given', () => {
    const before = JSON.stringify(tree);
    scopeNavigation(tree, 'services/billing');
    expect(JSON.stringify(tree)).toBe(before);
  });
});
