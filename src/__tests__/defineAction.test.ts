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
    expect(action.steps).toBeUndefined();
    expect(action.mountTimeout).toBeUndefined();
    expect(action.route).toBeUndefined();
  });

  it('includes steps with waitForMount', () => {
    const action = defineAction({
      name: 'grant_access',
      description: 'Grant access',
      steps: [
        { label: 'Click Settings', fromTarget: 'settings-tab', waitForMount: true },
        { label: 'Click Grant', fromTarget: 'grant-link', waitForMount: true },
      ],
    });
    expect(action.steps).toHaveLength(2);
    expect(action.steps![0].waitForMount).toBe(true);
    expect(action.steps![1].fromTarget).toBe('grant-link');
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
      steps: [
        { label: 'Step 1', fromTarget: 'btn-1', waitForMount: true },
        { label: 'Step 2', fromTarget: 'btn-2' },
      ],
      mountTimeout: 60_000,
    });
    expect(action.name).toBe('full_action');
    expect(action.steps).toHaveLength(2);
    expect(action.mountTimeout).toBe(60_000);
    expect(action.parameters).toBeDefined();
  });
});
