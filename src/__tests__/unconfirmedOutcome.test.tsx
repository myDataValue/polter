import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentTarget } from '../components/AgentTarget';
import { defineAction } from '../core/helpers';
import type {
  ExecutionResult,
  ExecutorConfig,
  RegisteredAction,
  ResolveDiagnostics,
} from '../core/types';
import { executeAction } from '../executor/visualExecutor';
import { useAgentAction } from '../hooks/useAgentAction';
import type { useAgentActions } from '../hooks/useAgentActions';
import { useAgentCommandRouter } from '../hooks/useAgentCommandRouter';
import { TestConsumer } from './testUtils';

// ---------------------------------------------------------------------------
// A control that is PRESENT BUT DISABLED is not the same fact as a control that
// is ABSENT, and only the second one licenses "nothing happened".
//
// Production incident: an agent dispatched `push_changes` while an earlier push
// was still committing 20 live promotion/Genius changes. The Push button stayed
// mounted-and-disabled for the whole resolve window, polter gave up and called
// it `not found`, and the backend escalated that into "those changes did NOT
// apply" — announced to a paying client about changes that were, at that moment,
// going live.
//
// These tests pin the distinction and its blast radius: `unconfirmed` is emitted
// by exactly TWO producers, and a genuinely absent target keeps the hard
// PRO-475 failure with no `outcomeKind` at all.
// ---------------------------------------------------------------------------

function makeConfig(diagnostics: ResolveDiagnostics, element: HTMLElement | null): ExecutorConfig {
  return {
    mode: 'instant',
    stepDelay: 0,
    overlayOpacity: 0,
    spotlightPadding: 0,
    tooltipEnabled: false,
    cursorEnabled: false,
    resolveTarget: vi.fn().mockResolvedValue({ element, diagnostics }),
  };
}

function diag(overrides: Partial<ResolveDiagnostics> = {}): ResolveDiagnostics {
  return {
    reason: 'unmounted',
    matchCount: 0,
    componentMounted: true,
    seenDisabled: false,
    elapsedMs: 1234,
    ...overrides,
  };
}

function stepAction(name: string): RegisteredAction {
  return {
    name,
    description: name,
    resolveSteps: () => [{ label: 'Push changes', target: 'push-btn' }],
  } as unknown as RegisteredAction;
}

describe('executor — a target that stayed disabled is reported as unconfirmed, not missing', () => {
  it('classifies a disabled-at-cap miss as unconfirmed and says the outcome is unknown', async () => {
    const result = await executeAction(
      stepAction('push_changes'),
      {},
      makeConfig(
        diag({ reason: 'disabled', matchCount: 1, seenDisabled: true, elapsedMs: 30105.8 }),
        null,
      ),
    );

    expect(result.outcomeKind).toBe('unconfirmed');
    // The wording is the agent's only ground truth, so pin its load-bearing
    // parts rather than the whole sentence.
    expect(result.error).toContain('stayed disabled');
    expect(result.error).toContain('30106ms');
    expect(result.error).toContain('never ran');
    expect(result.error).toContain('UNKNOWN');
    // It must not GUESS the cause: a control can be disabled by a busy sibling
    // run or by validation, and the executor cannot tell which.
    expect(result.error).not.toContain('previous run of this action');
    // The old text is what made the failure a lie — it must not come back.
    expect(result.error).not.toContain('not found');
  });

  it('keeps an ABSENT target a hard failure with no outcomeKind (PRO-475 unweakened)', async () => {
    const result = await executeAction(
      stepAction('push_changes'),
      {},
      makeConfig(diag({ reason: 'unmounted', matchCount: 0 }), null),
    );

    expect(result.error).toContain(
      'Target "push-btn" for action "push_changes" not found for step "Push changes"',
    );
    // An unmounted control provably received no click. Softening this to
    // "unconfirmed" would let a genuinely failed action read as maybe-applied.
    expect(result.outcomeKind).toBeUndefined();
  });

  it('records the disabled resolve diagnostics on the failing step trace', async () => {
    const result = await executeAction(
      stepAction('push_changes'),
      {},
      makeConfig(
        diag({ reason: 'disabled', matchCount: 1, seenDisabled: true, elapsedMs: 30105.8 }),
        null,
      ),
    );

    expect(result.trace[0]).toMatchObject({
      status: 'failed',
      targetFound: false,
      resolve: { reason: 'disabled', matchCount: 1, seenDisabled: true },
    });
  });
});

describe('resolver — disabled vs unmounted at the end of the poll window', () => {
  // This is the production case itself, so it is pinned end-to-end rather than
  // through a stub. It costs real wall-clock: the resolver's patience for a
  // disabled target is `step.timeout + LOADING_EXTENSION_MS`, and the 25s
  // extension is not parameterisable, so a zero base timeout is the floor.
  it('reports disabled when the target stays mounted and disabled for the whole window', async () => {
    const action = defineAction({ name: 'busy_push', description: 'Busy push' });

    function App() {
      useAgentAction({
        ...action,
        steps: [{ label: 'Push changes', target: 'push-btn', timeout: 0 }],
      });
      return (
        <AgentTarget name="push-btn">
          <button type="button" disabled>
            Push
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    const result = await act(async () => ctx!.execute('busy_push'));

    expect(result.trace[0]?.resolve).toMatchObject({
      reason: 'disabled',
      seenDisabled: true,
      matchCount: 1,
      componentMounted: true,
    });
    expect(result.outcomeKind).toBe('unconfirmed');
    expect(result.error).toContain('stayed disabled');
    expect(result.error).not.toContain('not found');
  }, 40000);

  it('reports unmounted (not disabled) when a disabled target then disappears', async () => {
    // The target renders disabled, then unmounts entirely. `seenDisabled` is
    // true, but the control is GONE — so it provably took no click and must
    // stay a hard failure. This is the discriminator that keeps `unconfirmed`
    // from swallowing real misses.
    const action = defineAction({ name: 'vanishing', description: 'Vanishing' });
    const setGoneRef: { current: ((v: boolean) => void) | null } = { current: null };

    function App() {
      const [gone, setGone] = useState(false);
      setGoneRef.current = setGone;
      useAgentAction({ ...action, steps: [{ label: 'click', target: 'go' }] });
      if (gone) return null;
      return (
        <AgentTarget name="go">
          <button type="button" disabled>
            go
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // Same shape as the PRO-184 disabled-while-loading guard: real timers plus
    // flushSync so the unmount commits synchronously mid-poll.
    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    const exec = act(async () => ctx!.execute('vanishing'));
    setTimeout(() => {
      flushSync(() => setGoneRef.current?.(true));
    }, 200);
    const result = await exec;

    expect(result.trace[0]?.resolve?.reason).toBe('unmounted');
    expect(result.outcomeKind).toBeUndefined();
    expect(result.error).toContain('not found');
  }, 20000);
});

describe('pre-execution short-circuit — only an opted-in action reports unconfirmed', () => {
  function renderDisabled(disabled: {
    disabledReason: string;
    disabledIsNoop?: boolean;
    disabledOutcome?: 'unconfirmed';
  }) {
    const action = defineAction({ name: 'push_changes', description: 'Push' });

    function App() {
      useAgentAction({ ...action, steps: [{ label: 'Push', target: 'push-btn' }], ...disabled });
      return (
        <AgentTarget name="push-btn">
          <button type="button" disabled>
            Push
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    return () => ctx!.execute('push_changes');
  }

  it('returns unconfirmed immediately when the action declares disabledOutcome', async () => {
    const run = renderDisabled({
      disabledReason: 'A push is already running; its outcome is not yet known.',
      disabledOutcome: 'unconfirmed',
    });

    let result!: ExecutionResult;
    await act(async () => {
      result = await run();
    });

    expect(result.outcomeKind).toBe('unconfirmed');
    expect(result.error).toContain('already running');
    // Still not a success: nothing was applied by THIS dispatch.
    expect(result.noop).toBeUndefined();
    expect(result.trace).toEqual([]);
  });

  it('leaves an ordinary disabled action a plain failure (no outcomeKind)', async () => {
    const run = renderDisabled({ disabledReason: 'Pushing is paused — see the banner.' });

    let result!: ExecutionResult;
    await act(async () => {
      result = await run();
    });

    expect(result.error).toContain('Pushing is paused');
    expect(result.outcomeKind).toBeUndefined();
  });

  it('leaves a benign nothing-to-do action a noop (PRO-920 unchanged)', async () => {
    const run = renderDisabled({
      disabledReason: 'Nothing to push — there are no staged changes.',
      disabledIsNoop: true,
    });

    let result!: ExecutionResult;
    await act(async () => {
      result = await run();
    });

    expect(result.noop).toBe(true);
    expect(result.outcomeKind).toBeUndefined();
  });
});

describe('public compatibility — outcomeKind stays an exhaustively narrowable union', () => {
  it('narrows over every member without a default branch', () => {
    const describeOutcome = (result: ExecutionResult): string => {
      switch (result.outcomeKind) {
        case 'noop':
          return 'nothing matched';
        case 'unconfirmed':
          return 'outcome unknown';
        case undefined:
          return 'ran';
      }
    };

    expect(describeOutcome({ actionName: 'a', trace: [], durationMs: 0 })).toBe('ran');
    expect(
      describeOutcome({ actionName: 'a', trace: [], durationMs: 0, outcomeKind: 'noop' }),
    ).toBe('nothing matched');
    expect(
      describeOutcome({ actionName: 'a', trace: [], durationMs: 0, outcomeKind: 'unconfirmed' }),
    ).toBe('outcome unknown');
  });
});

describe('command router — the production dispatch path carries the classification', () => {
  // `useAgentCommandRouter` short-circuits a disabled action itself and returns
  // BEFORE `execute()` is reached, so a classification wired only into
  // `execute()` would never reach a consumer dispatching over a socket — which
  // is how every agent command actually arrives.
  it('returns unconfirmed from its own short-circuit, not just from execute()', async () => {
    const action = defineAction({ name: 'push_changes', description: 'Push' });
    let route: ((cmd: { action: string }) => Promise<ExecutionResult | undefined>) | null = null;

    function Router() {
      const r = useAgentCommandRouter<{ action: string }>(null, (cmd) => cmd.action);
      route = r;
      return null;
    }

    function App() {
      useAgentAction({
        ...action,
        steps: [{ label: 'Push', target: 'push-btn' }],
        disabledReason: 'A push is already running.',
        disabledOutcome: 'unconfirmed',
      });
      return (
        <AgentTarget name="push-btn">
          <button type="button" disabled>
            Push
          </button>
        </AgentTarget>
      );
    }

    render(
      <AgentActionProvider mode="instant">
        <App />
        <Router />
      </AgentActionProvider>,
    );

    let result: ExecutionResult | undefined;
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: the router is published during render
      result = await route!({ action: 'push_changes' });
    });

    expect(result?.outcomeKind).toBe('unconfirmed');
    expect(result?.noop).toBeUndefined();
    expect(result?.trace).toEqual([]);
  });
});

describe('an action that becomes unconfirmed-disabled MID-execution', () => {
  // The flag can flip DURING a dispatch: a human clicks Push, or a previous
  // dispatch's push starts, while an agent run is already walking its steps.
  // The resolver then throws the disabledReason from inside the poll loop and
  // the run ends with that text as a plain error.
  //
  // Before this was carried through, the result reached the backend as a bare
  // failure whose message read "A push is ALREADY RUNNING … it has NOT failed"
  // — announced by the failure envelope as "those changes did NOT apply". A
  // self-contradicting sentence, and the original incident by a second door.
  it('keeps the classification when the flip happens mid-run', async () => {
    const action = defineAction({ name: 'push_changes', description: 'Push' });
    const setBusyRef: { current: ((v: boolean) => void) | null } = { current: null };

    function App() {
      const [busy, setBusy] = useState(false);
      setBusyRef.current = setBusy;
      useAgentAction({
        ...action,
        steps: [{ label: 'Push changes', target: 'push-btn', timeout: 2000 }],
        disabledReason: busy ? 'A push is ALREADY RUNNING.' : undefined,
        disabledOutcome: busy ? 'unconfirmed' : undefined,
      });
      return (
        <AgentTarget name="push-btn">
          <button type="button" disabled>
            Push
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    const exec = act(async () => ctx!.execute('push_changes'));
    setTimeout(() => flushSync(() => setBusyRef.current?.(true)), 300);
    const result = await exec;

    expect(result.error).toContain('ALREADY RUNNING');
    expect(result.outcomeKind).toBe('unconfirmed');
  }, 20000);

  it('carries it through the registry-to-component handoff too', async () => {
    // The second adoption point. A registry-only action (no component mounted
    // when the dispatch starts) has its runtime state adopted from the
    // component that mounts DURING execution. If that component says "a push is
    // already running", the classification has to survive the handoff — the
    // reason text arriving without it is the same false "did NOT apply".
    const action = defineAction({ name: 'push_changes', description: 'Push' });
    const setMountedRef: { current: ((v: boolean) => void) | null } = { current: null };

    function LateComponent() {
      useAgentAction({
        ...action,
        disabledReason: 'A push is ALREADY RUNNING.',
        disabledOutcome: 'unconfirmed',
      });
      return null;
    }

    function App() {
      const [mounted, setMounted] = useState(false);
      setMountedRef.current = setMounted;
      return mounted ? <LateComponent /> : null;
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[action]}>
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    const exec = act(async () => ctx!.execute('push_changes'));
    setTimeout(() => flushSync(() => setMountedRef.current?.(true)), 100);
    const result = await exec;

    expect(result.error).toContain('ALREADY RUNNING');
    expect(result.outcomeKind).toBe('unconfirmed');
  }, 20000);

  it('still withholds the benign noop classification mid-run', async () => {
    // The asymmetry is deliberate and must not drift: "nothing happened" after
    // steps have run could hide a half-applied change, so it stays withheld.
    const action = defineAction({ name: 'staged_action', description: 'Staged' });
    const setDoneRef: { current: ((v: boolean) => void) | null } = { current: null };

    function App() {
      const [done, setDone] = useState(false);
      setDoneRef.current = setDone;
      useAgentAction({
        ...action,
        steps: [{ label: 'Go', target: 'go-btn', timeout: 2000 }],
        disabledReason: done ? 'Nothing left to do.' : undefined,
        disabledIsNoop: done ? true : undefined,
      });
      return (
        <AgentTarget name="go-btn">
          <button type="button" disabled>
            Go
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // biome-ignore lint/style/noNonNullAssertion: ctx is assigned during render
    const exec = act(async () => ctx!.execute('staged_action'));
    setTimeout(() => flushSync(() => setDoneRef.current?.(true)), 300);
    const result = await exec;

    expect(result.error).toContain('Nothing left to do');
    expect(result.noop).toBeUndefined();
    expect(result.outcomeKind).toBeUndefined();
  }, 20000);
});
