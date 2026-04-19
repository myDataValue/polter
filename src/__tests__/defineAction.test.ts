import { describe, it, expect } from 'vitest';
import { defineAction } from '../core/defineAction';
import { z } from 'zod';

describe('defineAction', () => {
  it('creates a basic action definition', () => {
    const action = defineAction({
      name: 'export_csv',
      description: 'Export to CSV',
    });
    expect(action.name).toBe('export_csv');
    expect(action.description).toBe('Export to CSV');
    expect(action.navigateVia).toBeUndefined();
    expect(action.mountTimeout).toBeUndefined();
    expect(action.route).toBeUndefined();
  });

  it('includes navigateVia chain', () => {
    const action = defineAction({
      name: 'grant_access',
      description: 'Grant access',
      navigateVia: ['navigate_to_settings', 'navigate_to_grant_access'],
    });
    expect(action.navigateVia).toEqual(['navigate_to_settings', 'navigate_to_grant_access']);
  });

  it('includes mountTimeout', () => {
    const action = defineAction({
      name: 'slow_page',
      description: 'Slow loading page',
      mountTimeout: 120_000,
    });
    expect(action.mountTimeout).toBe(120_000);
  });

  it('includes route function', () => {
    const action = defineAction({
      name: 'view_property',
      description: 'View property',
      parameters: z.object({ id: z.number() }),
      route: (p) => `/properties/${p.id}`,
    });
    expect(action.route!({ id: 42 })).toBe('/properties/42');
  });

  it('includes all properties together', () => {
    const action = defineAction({
      name: 'full_action',
      description: 'Full action',
      parameters: z.object({ ids: z.array(z.number()) }),
      navigateVia: ['step1', 'step2'],
      mountTimeout: 60_000,
    });
    expect(action.name).toBe('full_action');
    expect(action.navigateVia).toEqual(['step1', 'step2']);
    expect(action.mountTimeout).toBe(60_000);
    expect(action.parameters).toBeDefined();
  });
});
