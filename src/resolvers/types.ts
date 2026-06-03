/**
 * Flexible target resolution — types.
 *
 * Today an agent step finds its DOM target by an EXACT registered name string
 * (`Map.get(name)`). That is fast and unambiguous but brittle: the agent has to
 * reconstruct the exact key (a grouped id-set like `201|219`, the right-level dest,
 * a string-vs-number id), and any drift is a silent miss.
 *
 * These types let a target SELF-DESCRIBE with structured attributes (a "description
 * card") so a generic resolver can match an intent to it tolerantly — by attribute
 * overlap rather than string equality — for any kind of target, with no per-type code.
 */

/**
 * A primitive attribute a target can be described by. Arrays model multi-valued
 * attributes such as a grouped type row's accommodation ids (`["201", "219"]`).
 */
export type TargetAttrValue =
  | string
  | number
  | boolean
  | ReadonlyArray<string | number>;

/** A target's (or an intent's) structured description: `{ label, ids, level, ... }`. */
export type TargetAttrs = Readonly<Record<string, TargetAttrValue>>;

/**
 * What a step is looking for, described semantically instead of by an exact name.
 * `role` is a HARD filter (a type intent never matches an operator target); `attrs`
 * are scored tolerantly (subset/superset id-sets, case-insensitive labels, …).
 */
export interface TargetIntent {
  readonly role?: string;
  readonly attrs?: TargetAttrs;
}

/** The minimum a value must expose to be resolvable by attributes. */
export interface DescribedTarget {
  readonly role?: string;
  readonly attrs?: TargetAttrs;
}

/** A target paired with its 0–1 match score against an intent. */
export interface TargetCandidate<T> {
  readonly target: T;
  readonly score: number;
}

/**
 * The outcome of resolving an intent against the registered targets:
 * - `matched`   — one confident winner (use it).
 * - `ambiguous` — several plausible targets (ask the user / disambiguate).
 * - `miss`      — nothing matched (log it loudly; do not silently fall back).
 *
 * `candidates` is always present (ranked, best first) so callers can surface or log them.
 */
export type TargetMatch<T> =
  | {
      readonly status: 'matched';
      readonly target: T;
      readonly score: number;
      readonly candidates: ReadonlyArray<TargetCandidate<T>>;
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: ReadonlyArray<TargetCandidate<T>>;
    }
  | {
      readonly status: 'miss';
      readonly candidates: ReadonlyArray<TargetCandidate<T>>;
    };
