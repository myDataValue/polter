import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { useAgentCommandRouter } from '../hooks/useAgentCommandRouter';
import { defineAction } from '../core/helpers';
import type { ExecutionResult } from '../core/types';

interface Command {
  action: string;
  payload?: Record<string, unknown>;
}

const syncAction = defineAction({ name: 'sync', description: 'Sync' });
const lockedAction = defineAction({ name: 'locked', description: 'Locked' });

function RouterConsumer({
  fallback,
  onRouter,
}: {
  fallback: ((cmd: Command) => void) | null;
  onRouter: (router: (cmd: Command) => Promise<ExecutionResult | undefined>) => void;
}) {
  const router = useAgentCommandRouter(fallback, (cmd: Command) => cmd.action);
  React.useEffect(() => {
    onRouter(router);
  });
  return null;
}

describe('useAgentCommandRouter', () => {
  it('should route registered actions through execute', async () => {
    const onClick = vi.fn();
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={syncAction}>
          <button onClick={onClick}>Sync</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    await act(() => router!({ action: 'sync', payload: { id: 1 } }));
    expect(onClick).toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('should fall through to fallback for unregistered actions', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    await act(() => router!({ action: 'unknown_action' }));
    expect(fallback).toHaveBeenCalledWith({ action: 'unknown_action' });
  });

  it('should return error for disabled actions without falling through', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={lockedAction} disabledReason="Not ready">
          <button>Locked</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    let result: ExecutionResult | undefined;
    await act(async () => {
      result = await router!({ action: 'locked' });
    });
    expect(result).toMatchObject({ success: false, actionName: 'locked', error: 'Not ready' });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('should handle null fallback gracefully', async () => {
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <RouterConsumer fallback={null} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    // Should not throw
    await act(() => router!({ action: 'anything' }));
  });
});
