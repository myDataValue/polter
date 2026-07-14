import { act, render } from '@testing-library/react';
import { Profiler, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AgentAction } from '../components/AgentAction';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentTarget } from '../components/AgentTarget';
import { defineAction } from '../core/helpers';
import { useAgentAction } from '../hooks/useAgentAction';
import type { useAgentActions } from '../hooks/useAgentActions';
import { TestConsumer } from './testUtils';

// ---------------------------------------------------------------------------
// Context split — re-render isolation (PERF INVARIANT)
//
// AgentTarget/useAgentAction subscribe ONLY to the stable API context. A
// dashboard mounts AgentTarget by the hundreds inside virtualized tables, so
// they must NOT re-render when isExecuting flips (2× per executed action) or
// when the action registry version bumps. If someone re-couples the volatile
// state into the context these consumers read, these tests fail — that's the
// point: the weakening must be visible.
// ---------------------------------------------------------------------------

/** Mounts/unmounts an extra registered action without touching siblings. */
function RegistrarToggle({ exposeToggle }: { exposeToggle: (toggle: () => void) => void }) {
  const [on, setOn] = useState(false);
  exposeToggle(() => setOn((v) => !v));
  return on ? <ExtraAction /> : null;
}

function ExtraAction() {
  useAgentAction({ name: 'extra_action', description: 'Extra', steps: [] });
  return null;
}

describe('split context re-render isolation', () => {
  it('does not re-render AgentTarget subtrees on registry bumps or execution flips', async () => {
    const targetCommits: string[] = [];
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    let toggleRegistrar: () => void = () => {};

    const clickAction = defineAction({ name: 'click_test', description: 'Click' });

    render(
      <AgentActionProvider mode="instant">
        <TestConsumer onContext={(c) => (ctx = c)} />
        <AgentAction action={clickAction}>
          <button type="button">Go</button>
        </AgentAction>
        <RegistrarToggle
          exposeToggle={(t) => {
            toggleRegistrar = t;
          }}
        />
        <Profiler id="target-subtree" onRender={(id) => targetCommits.push(id)}>
          <AgentTarget name="isolated-target">
            <button type="button">Isolated</button>
          </AgentTarget>
        </Profiler>
      </AgentActionProvider>,
    );

    const commitsAfterMount = targetCommits.length;

    // Registry bump: a sibling registers a brand-new action (version++).
    act(() => toggleRegistrar());
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    expect(ctx!.availableActions.map((a) => a.name)).toContain('extra_action');
    expect(targetCommits.length).toBe(commitsAfterMount);

    // Execution flip: isExecuting goes true -> false across an execute().
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    const result = await act(() => ctx!.execute('click_test'));
    expect(result.error).toBeUndefined();
    expect(targetCommits.length).toBe(commitsAfterMount);
  });

  it('still delivers volatile state to useAgentActions consumers', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    let toggleRegistrar: () => void = () => {};

    const clickAction = defineAction({ name: 'click_test', description: 'Click' });

    render(
      <AgentActionProvider mode="instant">
        <TestConsumer onContext={(c) => (ctx = c)} />
        <AgentAction action={clickAction}>
          <button type="button">Go</button>
        </AgentAction>
        <RegistrarToggle
          exposeToggle={(t) => {
            toggleRegistrar = t;
          }}
        />
      </AgentActionProvider>,
    );

    // Registry updates must re-render merged-hook consumers: the only way
    // `ctx` (captured in TestConsumer's effect) can see the new action is a
    // volatile-context-driven re-render. The split must not swallow it.
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    expect(ctx!.availableActions.map((a) => a.name)).not.toContain('extra_action');
    act(() => toggleRegistrar());
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    expect(ctx!.availableActions.map((a) => a.name)).toContain('extra_action');

    // Execution completes and returns to idle through the merged hook.
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    const result = await act(() => ctx!.execute('click_test'));
    expect(result.error).toBeUndefined();
    // biome-ignore lint/style/noNonNullAssertion: assigned during render above
    expect(ctx!.isExecuting).toBe(false);
  });
});
