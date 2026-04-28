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
    expect(action.route).toBeUndefined();
  });

  it('includes steps with target', () => {
    const action = defineAction({
      name: 'grant_access',
      description: 'Grant access',
      steps: [
        { label: 'Click Settings', target: 'settings-tab' },
        { label: 'Click Grant', target: 'grant-link' },
      ],
    });
    expect(action.steps).toHaveLength(2);
    expect(action.steps![0].target).toBe('settings-tab');
    expect(action.steps![1].target).toBe('grant-link');
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
        { label: 'Step 1', target: 'btn-1' },
        { label: 'Step 2', target: 'btn-2' },
      ],
    });
    expect(action.name).toBe('full_action');
    expect(action.steps).toHaveLength(2);
    expect(action.parameters).toBeDefined();
  });
});
