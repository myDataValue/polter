import { fc, it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import type { DescribedTarget } from '../resolvers';
import { AMBIGUITY_MARGIN, matchTargets, scoreAttrValue, scoreTarget } from '../resolvers';

// A small fixture mirroring real ranking targets.
const APARTMENTS = {
  role: 'type',
  attrs: { label: 'Apartments', ids: ['201', '219'], level: 'CITY' },
};
const VILLAS = { role: 'type', attrs: { label: 'Villas', ids: ['213'], level: 'CITY' } };
const SYKES = { role: 'operator', attrs: { id: '405776', label: 'Sykes Holiday Cottages' } };
const GUESTREADY = { role: 'operator', attrs: { id: '15357642', label: 'GuestReady' } };
const LONDON_CITY = {
  role: 'location',
  attrs: { destId: -2601889, label: 'London', level: 'CITY' },
};
const HYDEPARK = {
  role: 'location',
  attrs: { destId: 44, label: 'Hydepark, London', level: 'DISTRICT' },
};

const TARGETS: DescribedTarget[] = [APARTMENTS, VILLAS, SYKES, GUESTREADY, LONDON_CITY, HYDEPARK];

describe('scoreAttrValue', () => {
  it('treats an exact scalar match as full score', () => {
    expect(scoreAttrValue('Apartments', 'apartments')).toBe(1); // case-insensitive
    expect(scoreAttrValue(405776, '405776')).toBe(1); // number vs string id
  });

  it('scores partial strings below exact but above zero', () => {
    expect(scoreAttrValue('Sykes Holiday Cottages', 'Sykes')).toBeGreaterThan(0);
    expect(scoreAttrValue('Sykes Holiday Cottages', 'Sykes')).toBeLessThan(1);
  });

  it('matches a subset id-set strongly and disjoint sets at zero', () => {
    expect(scoreAttrValue(['201', '219'], ['201'])).toBeGreaterThanOrEqual(0.9); // partial -> group
    expect(scoreAttrValue(['201', '219'], ['201', '219'])).toBe(1);
    expect(scoreAttrValue(['201', '219'], ['213'])).toBe(0); // disjoint -> mismatch
  });
});

describe('scoreTarget', () => {
  it('disqualifies on a different role', () => {
    expect(scoreTarget(SYKES, { role: 'type', attrs: { label: 'Sykes' } })).toBeNull();
  });

  it('disqualifies on a present-but-contradictory attr (wrong level)', () => {
    // Asking for a DISTRICT entity must not match a CITY-level target.
    expect(
      scoreTarget(LONDON_CITY, { role: 'location', attrs: { label: 'London', level: 'DISTRICT' } }),
    ).toBeNull();
  });

  it('ignores attrs the target does not describe (neutral, not penalised)', () => {
    const s = scoreTarget(APARTMENTS, { role: 'type', attrs: { ids: ['201'], unknownAttr: 'x' } });
    expect(s).not.toBeNull();
  });

  it('matches a role-only intent against any same-role target', () => {
    expect(scoreTarget(SYKES, { role: 'operator' })).toBe(1);
  });
});

describe('matchTargets', () => {
  it('resolves a partial type id-set to the full group row', () => {
    const r = matchTargets(TARGETS, { role: 'type', attrs: { ids: ['201'] } });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.target).toBe(APARTMENTS);
  });

  it('resolves a label when the agent has no id', () => {
    const r = matchTargets(TARGETS, { role: 'type', attrs: { label: 'villas' } });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.target).toBe(VILLAS);
  });

  it('treats an empty intent attr as no-constraint, matching on the rest', () => {
    // The agent sends only a label (empty ids) — empty must not disqualify.
    const r = matchTargets(TARGETS, { role: 'type', attrs: { ids: [], label: 'apartments' } });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.target).toBe(APARTMENTS);
  });

  it('resolves an operator by a numeric id against a string-id target', () => {
    const r = matchTargets(TARGETS, { role: 'operator', attrs: { id: 405776 } });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.target).toBe(SYKES);
  });

  it('keeps level-specific dests apart (London CITY vs Hydepark DISTRICT)', () => {
    const district = matchTargets(TARGETS, {
      role: 'location',
      attrs: { label: 'London', level: 'DISTRICT' },
    });
    // Only Hydepark is at DISTRICT; London CITY is disqualified by the level mismatch.
    if (district.status === 'matched') expect(district.target).toBe(HYDEPARK);
    const city = matchTargets(TARGETS, {
      role: 'location',
      attrs: { destId: -2601889, level: 'CITY' },
    });
    expect(city.status).toBe('matched');
    if (city.status === 'matched') expect(city.target).toBe(LONDON_CITY);
  });

  it('reports a miss (not a wrong match) when nothing fits', () => {
    const r = matchTargets(TARGETS, { role: 'type', attrs: { label: 'Spaceships' } });
    expect(r.status).toBe('miss');
  });

  it('reports ambiguity when two targets tie', () => {
    const dupA = { role: 'operator', attrs: { label: 'Acme' } };
    const dupB = { role: 'operator', attrs: { label: 'Acme' } };
    const r = matchTargets([dupA, dupB], { role: 'operator', attrs: { label: 'Acme' } });
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
  });
});

describe('scoreAttrValue — properties', () => {
  // The example tests above pin exact / partial / disjoint scalar and id-set
  // scores. These pin the contract the aggregator in scoreTarget relies on for
  // EVERY pair: a score in [0,1], reflexivity (a value scores 1 against itself),
  // a hard 0 when either side is empty, and the documented set-overlap outcomes.
  // `toTokens` in scoring.ts trims each value and drops blanks, so a
  // whitespace-only string (e.g. " ") is treated as *no token at all*. A token
  // arbitrary that can emit blank-after-trim strings therefore breaks the
  // reflexivity / overlap invariants below (scoreAttrValue(" ", " ") === 0, not
  // 1). Exclude blank-after-trim strings so every generated token is a real,
  // comparable token — matching what the implementation actually scores.
  const token = fc.oneof(
    fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
    fc.integer({ min: 0, max: 9999 }),
  );
  const idSet = fc.uniqueArray(token, { minLength: 1, maxLength: 5 });

  it.prop([token, token])('always returns a value in [0, 1]', (a, b) => {
    const s = scoreAttrValue(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it.prop([idSet, idSet])('id-set scores stay within [0, 1]', (a, b) => {
    const s = scoreAttrValue(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it.prop([token])('a non-empty scalar matches itself with a full score of 1', (t) => {
    // Case-insensitive: the implementation lowercases both sides.
    expect(scoreAttrValue(t, t)).toBe(1);
    expect(scoreAttrValue(String(t).toUpperCase(), String(t).toLowerCase())).toBe(1);
  });

  it.prop([idSet])('an identical id-set scores 1', (ids) => {
    expect(scoreAttrValue(ids, [...ids])).toBe(1);
  });

  it.prop([idSet])('an empty intent (no constraint) is a hard 0, never a partial match', (ids) => {
    expect(scoreAttrValue(ids, [])).toBe(0);
    expect(scoreAttrValue([], ids)).toBe(0);
    expect(scoreAttrValue(ids, '')).toBe(0);
  });

  it.prop([idSet, idSet])('disjoint id-sets score 0 and any overlap scores > 0', (a, b) => {
    // Mirror toTokens exactly (trim + lowercase, drop blanks); a blank-after-trim
    // value is not a token the implementation can match, so it must not count as
    // overlap in the oracle either.
    const toTok = (x: string | number) => String(x).trim().toLowerCase();
    const aTokens = new Set(a.map(toTok).filter((s) => s.length > 0));
    const overlap = b.map(toTok).some((x) => x.length > 0 && aTokens.has(x));
    if (overlap) {
      expect(scoreAttrValue(a, b)).toBeGreaterThan(0);
    } else {
      expect(scoreAttrValue(a, b)).toBe(0);
    }
  });
});

describe('matchTargets — properties', () => {
  it.prop([fc.constantFrom(...TARGETS)])(
    'a target is always found by its own exact attrs',
    (target) => {
      const r = matchTargets(TARGETS, { role: target.role, attrs: target.attrs });
      // Either it is the unique winner, or it ties with an identical-attr sibling.
      if (r.status === 'matched') {
        expect(r.target).toBe(target);
      } else {
        expect(r.status).toBe('ambiguous');
      }
    },
  );

  it.prop([fc.array(fc.string(), { maxLength: 4 })])(
    'never throws and never invents a candidate from an empty registry',
    (ids) => {
      const r = matchTargets([], { role: 'type', attrs: { ids } });
      expect(r.status).toBe('miss');
      expect(r.candidates).toHaveLength(0);
    },
  );

  it('uses the documented ambiguity margin constant', () => {
    expect(AMBIGUITY_MARGIN).toBeGreaterThan(0);
  });
});
