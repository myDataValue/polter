import { fc, it as itProp } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { isDegenerateRect } from '../executor/visualExecutor';

// A connected-but-unlaid-out target (hidden tab, narrow-screen breakpoint, mid
// re-render) reports an all-zero box. The visual executor skips moving the cursor /
// spotlight to such a rect so they don't snap to the top-left corner. The condition
// must be AND (both dimensions zero) — a degenerate box — not OR, which would wrongly
// skip a thin-but-real 1px-tall divider or a zero-width-but-tall element.
describe('isDegenerateRect', () => {
  it('is true only when BOTH width and height are zero', () => {
    expect(isDegenerateRect({ width: 0, height: 0 })).toBe(true);
  });

  it('is false for a laid-out element', () => {
    expect(isDegenerateRect({ width: 120, height: 32 })).toBe(false);
  });

  it('is false when only one dimension is zero (a real, thin box)', () => {
    expect(isDegenerateRect({ width: 200, height: 0 })).toBe(false);
    expect(isDegenerateRect({ width: 0, height: 18 })).toBe(false);
  });

  // Property form of the AND-not-OR rule: over the whole width×height plane the
  // predicate is true iff BOTH dimensions are exactly zero — the example cases
  // are just three points of this invariant.
  itProp.prop([fc.nat({ max: 4000 }), fc.nat({ max: 4000 })])(
    'is true iff both dimensions are exactly zero',
    (width, height) => {
      expect(isDegenerateRect({ width, height })).toBe(width === 0 && height === 0);
    },
  );
});
