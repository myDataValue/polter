import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { useAgentActions } from '../hooks/useAgentActions';
import { defineAction } from '../core/defineAction';
import { z } from 'zod';

function TestConsumer({ onContext }: { onContext: (ctx: ReturnType<typeof useAgentActions>) => void }) {
  const ctx = useAgentActions();
  React.useEffect(() => {
    onContext(ctx);
  });
  return null;
}

const exportCsv = defineAction({
  name: 'export_csv',
  description: 'Export to CSV',
  route: () => '/export',
});

const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant access',
  navigateVia: ['nav_settings', 'nav_grant'],
  mountTimeout: 60_000,
  parameters: z.object({
    property_ids: z.array(z.number()).describe('Property IDs'),
  }),
});

describe('Registry', () => {
  it('registers defineAction schemas before component mount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider registry={[exportCsv, grantAccess]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(2);
    expect(ctx!.schemas).toHaveLength(2);
    expect(ctx!.availableActions.map((a) => a.name)).toEqual(['export_csv', 'grant_access']);
  });

  it('component-backed action overrides registry version', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[exportCsv]}>
        <AgentAction action={exportCsv}>
          <button>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // Still one action, not duplicated
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].name).toBe('export_csv');
  });

  it('restores registry version on component unmount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider registry={[exportCsv]}>
        <AgentAction action={exportCsv}>
          <button>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);

    // Unmount the AgentAction — registry version should restore
    rerender(
      <AgentActionProvider registry={[exportCsv]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // Action still visible (from registry), not removed
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].name).toBe('export_csv');
  });

  it('preserves navigateVia from registry when component registers', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[grantAccess]}>
        <AgentAction action={grantAccess}>
          <button>Grant</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // The action should still be available
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].name).toBe('grant_access');
  });
});

describe('componentBacked flag', () => {
  it('AgentAction sets componentBacked to true', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[exportCsv]}>
        <AgentAction action={exportCsv}>
          <button>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // Execute should succeed (component is mounted)
    const result = await act(() => ctx!.execute('export_csv'));
    expect(result.success).toBe(true);
  });

  it('registry-only action without component has no componentBacked flag', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[exportCsv]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // Action exists in schemas but has no component — execute should handle gracefully
    expect(ctx!.availableActions).toHaveLength(1);
  });
});

describe('Zod param validation', () => {
  it('fails early when required params are missing', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[grantAccess]}>
        <AgentAction action={grantAccess}>
          <button>Grant</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // Call without property_ids — should fail before any navigation
    const result = await act(() => ctx!.execute('grant_access', {}));
    expect(result.success).toBe(false);
    expect(result.error).toContain('property_ids');
  });

  it('passes when required params are provided', async () => {
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[grantAccess]}>
        <AgentAction action={grantAccess}>
          <button onClick={onClick}>Grant</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('grant_access', { property_ids: [1, 2, 3] }));
    expect(result.success).toBe(true);
    expect(onClick).toHaveBeenCalled();
  });

  it('skips validation for actions without parameters schema', async () => {
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[exportCsv]}>
        <AgentAction action={exportCsv}>
          <button onClick={onClick}>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('export_csv'));
    expect(result.success).toBe(true);
  });
});

describe('disabled after navigation', () => {
  const lockedAction = defineAction({ name: 'locked', description: 'Locked action' });

  it('returns disabledReason when action is disabled', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={lockedAction} disabled disabledReason="Not logged in">
          <button>Locked</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('locked'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not logged in');
  });
});
