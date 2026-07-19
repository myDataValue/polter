import { act, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AgentAction } from '../components/AgentAction';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { defineAction } from '../core/helpers';
import type { ExecutionResult } from '../core/types';
import { useAgentAction } from '../hooks/useAgentAction';
import { useAgentCommandRouter } from '../hooks/useAgentCommandRouter';

interface Command {
  action: string;
  payload?: Record<string, unknown>;
}

const syncAction = defineAction({ name: 'sync', description: 'Sync' });
const lockedAction = defineAction({ name: 'locked', description: 'Locked' });
const idleAction = defineAction({ name: 'idle', description: 'Idle' });

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
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button onClick={onClick}>Sync</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
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

    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    await act(() => router!({ action: 'unknown_action' }));
    expect(fallback).toHaveBeenCalledWith({ action: 'unknown_action' });
  });

  it('should return error for disabled actions without falling through', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={lockedAction} disabledReason="Not ready">
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button>Locked</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    let result: ExecutionResult | undefined;
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      result = await router!({ action: 'locked' });
    });
    expect(result).toMatchObject({ actionName: 'locked', error: 'Not ready' });
    // A plain block is a failure — it must NOT be softened into a no-op.
    expect(result?.noop).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });

  // A disabled action can mean two different things, and the caller cannot tell
  // them apart from the reason text alone: "you are blocked" vs "there was nothing
  // to do". `disabledIsNoop` carries that classification onto the result so a
  // benign nothing-to-do dispatch isn't reported as a failed change (PRO-920: a
  // push with nothing staged was announced to the user as "FAILED — those changes
  // did NOT apply", right after the real push had committed them).
  it('flags a benign nothing-to-do disabled action as a no-op', async () => {
    const fallback = vi.fn();
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={idleAction} disabledReason="Nothing to do" disabledIsNoop>
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button>Idle</button>
        </AgentAction>
        <RouterConsumer fallback={fallback} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    let result: ExecutionResult | undefined;
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      result = await router!({ action: 'idle' });
    });
    // The reason still rides along as `error` for context, but `noop` is what the
    // caller keys the "nothing happened" report off.
    expect(result).toMatchObject({ actionName: 'idle', error: 'Nothing to do', noop: true });
    expect(fallback).not.toHaveBeenCalled();
  });

  // `availableActions` (what this router reads) is memoised on the registry
  // version, so re-registration has to bump it when the CLASSIFICATION changes —
  // not just when the reason text does. A consumer that reuses one reason string
  // for both a benign and a blocking state would otherwise keep the previous
  // flag, and a real block would come back `noop: true`: the agent gets told
  // "nothing happened, do not retry" about a write that genuinely did not apply.
  it('re-registers when only disabledIsNoop flips, keeping one reason string', async () => {
    const sameReason = 'Push unavailable';
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    function Flipping({ isNoop }: { isNoop: boolean }) {
      useAgentAction({ ...idleAction, disabledReason: sameReason, disabledIsNoop: isNoop });
      return null;
    }
    const Tree = ({ isNoop }: { isNoop: boolean }) => (
      <AgentActionProvider mode="instant">
        <Flipping isNoop={isNoop} />
        <RouterConsumer fallback={null} onRouter={(r) => (router = r)} />
      </AgentActionProvider>
    );

    const { rerender } = render(<Tree isNoop />);
    let first: ExecutionResult | undefined;
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: published by RouterConsumer
      first = await router!({ action: 'idle' });
    });
    expect(first?.noop).toBe(true);

    // Same reason text, now a REAL block.
    rerender(<Tree isNoop={false} />);
    let second: ExecutionResult | undefined;
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: published by RouterConsumer
      second = await router!({ action: 'idle' });
    });
    expect(second?.error).toBe(sameReason);
    expect(second?.noop).toBeUndefined();
  });

  it('should handle null fallback gracefully', async () => {
    let router: ((cmd: Command) => Promise<ExecutionResult | undefined>) | null = null;

    render(
      <AgentActionProvider mode="instant">
        <RouterConsumer fallback={null} onRouter={(r) => (router = r)} />
      </AgentActionProvider>,
    );

    // Should not throw
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    await act(() => router!({ action: 'anything' }));
  });
});
