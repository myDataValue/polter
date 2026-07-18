import { describe, expect, it } from 'vitest';
import {
  navigationDestinationTarget,
  normalizeNavigateTo,
} from '../components/AgentActionProvider';
import type { StepDefinition } from '../core/types';

// Pure unit tests for the navigateTo normalizer + destination heuristic. No
// React — these operate on plain data so the string→step contract and the
// aria-current destination selection can be verified in isolation.

describe('normalizeNavigateTo', () => {
  it('returns [] for undefined', () => {
    expect(normalizeNavigateTo(undefined)).toEqual([]);
  });

  it('maps a bare string to a click step', () => {
    expect(normalizeNavigateTo('overview-tab')).toEqual([
      { label: 'overview-tab', target: 'overview-tab' },
    ]);
  });

  it('maps each string entry in an array to a click step', () => {
    expect(normalizeNavigateTo(['profile-menu', 'settings-tab'])).toEqual([
      { label: 'profile-menu', target: 'profile-menu' },
      { label: 'settings-tab', target: 'settings-tab' },
    ]);
  });

  it('passes a StepDefinition entry through unchanged', () => {
    const step: StepDefinition = {
      label: 'Open mobile menu',
      target: 'mobile-nav-menu',
      optional: true,
      timeout: 10,
    };
    expect(normalizeNavigateTo([step])).toEqual([step]);
  });

  it('handles a mixed array of steps and string target names', () => {
    const step: StepDefinition = { label: 'Open Section', target: 'section-tab' };
    expect(normalizeNavigateTo([step, 'panel-btn'])).toEqual([
      step,
      { label: 'panel-btn', target: 'panel-btn' },
    ]);
  });
});

describe('navigationDestinationTarget', () => {
  it('returns undefined for an empty list', () => {
    expect(navigationDestinationTarget([])).toBeUndefined();
  });

  it('picks the last string-target hop', () => {
    expect(navigationDestinationTarget(normalizeNavigateTo(['a', 'b']))).toBe('b');
  });

  it('ignores a trailing optional hop', () => {
    const steps: StepDefinition[] = [
      { label: 'Open Overview', target: 'overview-tab' },
      { label: 'Maybe open menu', target: 'mobile-nav-menu', optional: true },
    ];
    expect(navigationDestinationTarget(steps)).toBe('overview-tab');
  });

  it('ignores a trailing function-target hop', () => {
    const steps: StepDefinition[] = [
      { label: 'Open Overview', target: 'overview-tab' },
      { label: 'Open row', target: (p) => `row:${p.id}` },
    ];
    expect(navigationDestinationTarget(steps)).toBe('overview-tab');
  });

  it('returns undefined when no hop has a static string target', () => {
    const steps: StepDefinition[] = [
      { label: 'Open row', target: (p) => `row:${p.id}` },
      { label: 'Maybe open menu', target: 'mobile-nav-menu', optional: true },
    ];
    expect(navigationDestinationTarget(steps)).toBeUndefined();
  });
});
