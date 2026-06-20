/**
 * Flexible target resolution — deterministic attribute scoring.
 *
 * Pure, synchronous, no DOM, no ML: matching is fast enough to run inline in the
 * resolve poll loop and is fully unit-testable. The scoring is intentionally simple and
 * explainable — overlap of structured attributes — rather than an opaque embedding.
 *
 * @example
 *   matchTargets(
 *     [{ role: 'type', attrs: { label: 'Apartments', ids: ['201', '219'] } }],
 *     { role: 'type', attrs: { ids: ['201'] } },          // partial id-set
 *   );
 *   // -> { status: 'matched', target: <the Apartments row>, score: 0.9, ... }
 */

import type {
  DescribedTarget,
  TargetAttrValue,
  TargetCandidate,
  TargetIntent,
  TargetMatch,
} from './types';

/** Minimum aggregate score for a target to count as a match at all. */
export const MATCH_THRESHOLD = 0.5;
/** The top candidate must beat the runner-up by at least this much to auto-pick it;
 *  otherwise the result is `ambiguous` and the caller should disambiguate. */
export const AMBIGUITY_MARGIN = 0.15;

function toTokens(value: TargetAttrValue): readonly string[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => String(v).trim().toLowerCase()).filter((v) => v.length > 0);
}

/** An empty attr value (empty array / blank string) is "no constraint", not a mismatch. */
function isEmptyAttr(value: TargetAttrValue): boolean {
  return toTokens(value).length === 0;
}

/**
 * Score one attribute pair in [0, 1]. `0` is a DEFINITE mismatch (disqualifying); a
 * positive value is full or partial agreement. Values are compared as lowercased string
 * tokens, so `405776` (number) matches `"405776"` (string) and casing is ignored.
 */
export function scoreAttrValue(target: TargetAttrValue, intent: TargetAttrValue): number {
  const multi = Array.isArray(target) || Array.isArray(intent);
  const t = toTokens(target);
  const i = toTokens(intent);
  if (t.length === 0 || i.length === 0) return 0;

  if (multi) {
    const tSet = new Set(t);
    const iSet = new Set(i);
    const overlap = [...iSet].filter((x) => tSet.has(x)).length;
    if (overlap === 0) return 0;
    const intentSubset = [...iSet].every((x) => tSet.has(x));
    const targetSubset = [...tSet].every((x) => iSet.has(x));
    if (intentSubset && targetSubset) return 1; // same set
    if (intentSubset) return 0.9; // e.g. intent ["201"] ⊆ target ["201","219"]
    if (targetSubset) return 0.85;
    return 0.6; // partial overlap
  }

  const [ts] = t;
  const [is] = i;
  if (ts === is) return 1;
  if (ts.startsWith(is) || is.startsWith(ts)) return 0.8;
  if (ts.includes(is) || is.includes(ts)) return 0.6;
  return 0;
}

/**
 * Aggregate a target's score against an intent, or `null` if it is disqualified.
 *
 * - `role` is a hard filter: a different role disqualifies.
 * - A role-only intent (no attrs) matches any same-role target (score 1).
 * - For each intent attr the target also has, the per-attr score contributes; a present
 *   but mismatched attr (score 0 — e.g. a different `level`, or no id overlap) disqualifies.
 * - Attrs the target does NOT expose are neutral (skipped), so partial metadata still matches.
 * - The score is the mean of the contributing attrs; `null` if nothing was comparable.
 */
export function scoreTarget(target: DescribedTarget, intent: TargetIntent): number | null {
  if (intent.role !== undefined && target.role !== intent.role) return null;

  const intentAttrs = intent.attrs ?? {};
  const keys = Object.keys(intentAttrs);
  if (keys.length === 0) return intent.role !== undefined ? 1 : null;

  const targetAttrs = target.attrs ?? {};
  let sum = 0;
  let counted = 0;
  for (const key of keys) {
    if (isEmptyAttr(intentAttrs[key])) continue; // no constraint on this attr — neutral
    if (!(key in targetAttrs)) continue; // target doesn't describe this attr — neutral
    const s = scoreAttrValue(targetAttrs[key], intentAttrs[key]);
    if (s === 0) return null; // present but contradictory — disqualify
    sum += s;
    counted += 1;
  }
  if (counted === 0) return null; // shared no attributes — not a match
  return sum / counted;
}

/**
 * Resolve an intent against a set of self-describing targets. Ranks every non-disqualified
 * target and returns a confident `matched`, an `ambiguous` set, or a `miss` (see
 * {@link TargetMatch}). Pure and order-stable: ties keep input order.
 */
export function matchTargets<T extends DescribedTarget>(
  targets: ReadonlyArray<T>,
  intent: TargetIntent,
): TargetMatch<T> {
  const scored: Array<TargetCandidate<T>> = [];
  targets.forEach((target) => {
    const score = scoreTarget(target, intent);
    if (score !== null) scored.push({ target, score });
  });
  // Stable sort by score desc (Array.prototype.sort is stable in modern engines).
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < MATCH_THRESHOLD) {
    return { status: 'miss', candidates: scored };
  }
  const second = scored[1];
  if (!second || top.score - second.score >= AMBIGUITY_MARGIN) {
    return {
      status: 'matched',
      target: top.target,
      score: top.score,
      candidates: scored,
    };
  }
  return { status: 'ambiguous', candidates: scored };
}
