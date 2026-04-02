import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { useAgentCommandRouter } from '../hooks/useAgentCommandRouter';

interface Command {
  action: string;
  payload?: Record<string, unknown>;
}

function RouterConsumer({
  fallback,
  onRouter,
}: {
  fallback: ((cmd: Command) => void) | null;
  onRouter: (router: (cmd: Command) => Promise<void>) => void;
}) {
  const router = useAgentCommandRouter(fallback, (cmd: Command) => cmd.action);
  React.useEffect(() => {
    onRouter(router);
  });
  return null;
}

describe('useAgentCommandRouter', () => {
  it('routes registered actions through execute', async () => {
    const onExecute = vi.fn();
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<void>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction name="sync" description="Sync" onExecute={onExecute}>
          <button>Sync</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    await act(() => router!({ action: 'sync', payload: { id: 1 } }));
    expect(onExecute).toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls through to fallback for unregistered actions', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<void>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    await act(() => router!({ action: 'unknown_action' }));
    expect(fallback).toHaveBeenCalledWith({ action: 'unknown_action' });
  });

  it('falls through for disabled actions', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<void>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction name="locked" description="Locked" disabled>
          <button>Locked</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    await act(() => router!({ action: 'locked' }));
    expect(fallback).toHaveBeenCalledWith({ action: 'locked' });
  });

  it('handles null fallback gracefully', async () => {
    let router: ((cmd: Command) => Promise<void>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <RouterConsumer fallback={null} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    // Should not throw
    await act(() => router!({ action: 'anything' }));
  });
});
