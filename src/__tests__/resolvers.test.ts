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
