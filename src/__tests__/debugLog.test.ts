import { describe, it, expect, vi } from 'vitest';
import { findCandidateTargetNames, createDebugLogger } from '../core/debugLog';

describe('findCandidateTargetNames', () => {
  it('returns mounted names sharing the wanted name prefix', () => {
    const registered = [
      'edit_airbnb_pms_markup-661295950822582016',
      'edit_airbnb_pms_markup-661295950822582017',
      'select-all-checkbox',
      'search-input',
    ];
    // The wanted listing isn't mounted, but two siblings are — surfaces the
    // ID-mismatch / virtualized-out case that hung edit_airbnb_pms_markup.
    expect(findCandidateTargetNames(registered, 'edit_airbnb_pms_markup-46078439')).toEqual([
      'edit_airbnb_pms_markup-661295950822582016',
      'edit_airbnb_pms_markup-661295950822582017',
    ]);
  });

  it('excludes the exact wanted name from candidates', () => {
    expect(findCandidateTargetNames(['foo-1', 'foo-2'], 'foo-1')).toEqual(['foo-2']);
  });

  it('returns [] when the wanted name has no "-" prefix separator', () => {
    expect(findCandidateTargetNames(['markup-input', 'search-input'], 'searchinput')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    const registered = Array.from({ length: 20 }, (_, i) => `x-${i}`);
    expect(findCandidateTargetNames(registered, 'x-999', 3)).toHaveLength(3);
  });
});

describe('createDebugLogger', () => {
  it('is a no-op when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLogger(false)('event', { a: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('emits a [polter]-prefixed line when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLogger(true)('resolveTarget:miss', { name: 'x' });
    expect(spy).toHaveBeenCalledWith('[polter] resolveTarget:miss', { name: 'x' });
    spy.mockRestore();
  });
});
