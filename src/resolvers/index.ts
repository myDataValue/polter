/**
 * Flexible, attribute-based target resolution.
 *
 * A complement to Polter's exact-name target lookup: register targets with a structured
 * description (`role` + `attrs`) and resolve an agent's intent against them tolerantly,
 * so a partial id-set, a label-instead-of-id, or a number-vs-string id still finds the
 * right element — and an ambiguous or missing match is reported rather than silently lost.
 */

export type {
  TargetAttrValue,
  TargetAttrs,
  TargetIntent,
  DescribedTarget,
  TargetCandidate,
  TargetMatch,
} from './types';

export {
  matchTargets,
  scoreTarget,
  scoreAttrValue,
  MATCH_THRESHOLD,
  AMBIGUITY_MARGIN,
} from './scoring';
