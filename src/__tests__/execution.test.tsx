import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

const DOM_PROPERTY_OPTS = { numRuns: 20 };
const DOM_TIMEOUT = 30_000;
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentActions } from '../hooks/useAgentActions';
import { useAgentAction } from '../hooks/useAgentAction';
import { defineAction } from '../core/helpers';
import { fromParam } from '../core/helpers';
import type { ExecutionResult } from '../core/types';
import { z } from 'zod';
import { TestConsumer } from './testUtils';

// ---------------------------------------------------------------------------
// Click execution
// ---------------------------------------------------------------------------

describe('click execution', () => {
  it('should click the wrapped element in instant mode', async () => {
    const action = defineAction({ name: 'click_test', description: 'Click' });
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action}>
          <button onClick={onClick}>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('click_test'));
    expect(result.error).toBeUndefined();
    expect(onClick).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Value typing
// ---------------------------------------------------------------------------

const valueAction = defineAction({ name: 'value_test', description: 'Value' });

describe('value typing', () => {
  it('should type any literal string value into the target input', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (literal) => {
        let ctx: ReturnType<typeof useAgentActions> | null = null;
        function Harness() {
          useAgentAction({
            ...valueAction,
            steps: [{ label: 'type', value: literal, target: 'input' }],
          });
          return <AgentTarget name="input"><input data-testid="input" /></AgentTarget>;
        }
        render(
          <AgentActionProvider mode="instant">
            <Harness />
            <TestConsumer onContext={(c) => (ctx = c)} />
          </AgentActionProvider>,
        );
        await act(() => ctx!.execute('value_test'));
        expect((document.querySelector('[data-testid="input"]') as HTMLInputElement).value).toBe(literal);
        cleanup();
      }),
      DOM_PROPERTY_OPTS,
    );
  });

  it('should type a fromParam-resolved value for any param name and value', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !Object.prototype.hasOwnProperty.call(Object.prototype, s)),
        fc.string(),
        async (paramName, paramValue) => {
          let ctx: ReturnType<typeof useAgentActions> | null = null;
          function Harness() {
            useAgentAction({
              ...valueAction,
              steps: [{ label: 'type', value: fromParam(paramName), target: 'input' }],
            });
            return <AgentTarget name="input"><input data-testid="input" /></AgentTarget>;
          }
          render(
            <AgentActionProvider mode="instant">
              <Harness />
              <TestConsumer onContext={(c) => (ctx = c)} />
            </AgentActionProvider>,
          );
          await act(() => ctx!.execute('value_test', { [paramName]: paramValue }));
          expect((document.querySelector('[data-testid="input"]') as HTMLInputElement).value).toBe(paramValue);
          cleanup();
        },
      ),
    );
  });

  it('should click instead of typing when value function returns undefined', async () => {
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({
        ...valueAction,
        steps: [{ label: 'maybe type', value: fromParam('missing'), target: 'btn' }],
      });
      return <AgentTarget name="btn"><button onClick={onClick}>Go</button></AgentTarget>;
    }
    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('value_test', {}));
    expect(onClick).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skipIf
// ---------------------------------------------------------------------------

const skipAction = defineAction({ name: 'skip_test', description: 'Skip' });

describe('skipIf', () => {
  it('should skip or run step based on skipIf return value', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (shouldSkip) => {
        const onClick = vi.fn();
        let ctx: ReturnType<typeof useAgentActions> | null = null;
        function Harness() {
          useAgentAction({
            ...skipAction,
            steps: [{ label: 'step', target: 'btn', skipIf: () => shouldSkip }],
          });
          return <AgentTarget name="btn"><button onClick={onClick}>Go</button></AgentTarget>;
        }
        render(
          <AgentActionProvider mode="instant">
            <Harness />
            <TestConsumer onContext={(c) => (ctx = c)} />
          </AgentActionProvider>,
        );
        await act(() => ctx!.execute('skip_test'));
        expect(onClick).toHaveBeenCalledTimes(shouldSkip ? 0 : 1);
        cleanup();
      }),
      DOM_PROPERTY_OPTS,
    );
  });

  it('should pass action params to the skipIf predicate', async () => {
    const predicate = vi.fn((p: Record<string, unknown>) => p.skip === true);
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({
        ...skipAction,
        steps: [{ label: 'step', target: 'btn', skipIf: predicate }],
      });
      return <AgentTarget name="btn"><button>Go</button></AgentTarget>;
    }
    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('skip_test', { skip: true, other: 'y' }));
    expect(predicate).toHaveBeenCalledWith({ skip: true, other: 'y' });
  });
});

// ---------------------------------------------------------------------------
// Closure freshness — regression guards for useEffectEvent
// ---------------------------------------------------------------------------

describe('closure freshness', () => {
  it('should read the latest skipIf closure for any sequence of state changes', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        async (sequence) => {
          const onClick = vi.fn();
          let setSkip: (v: boolean) => void = () => {};
          let ctx: ReturnType<typeof useAgentActions> | null = null;

          function Harness() {
            const [skip, setter] = React.useState(false);
            setSkip = setter;
            useAgentAction({
              ...skipAction,
              steps: [{ label: 'step', target: 'btn', skipIf: () => skip }],
            });
            return <AgentTarget name="btn"><button onClick={onClick}>Go</button></AgentTarget>;
          }
          render(
            <AgentActionProvider mode="instant">
              <Harness />
              <TestConsumer onContext={(c) => (ctx = c)} />
            </AgentActionProvider>,
          );

          let expectedClicks = 0;
          for (const shouldSkip of sequence) {
            act(() => setSkip(shouldSkip));
            await act(() => ctx!.execute('skip_test'));
            if (!shouldSkip) expectedClicks += 1;
          }
          expect(onClick).toHaveBeenCalledTimes(expectedClicks);
          cleanup();
        },
      ),
      DOM_PROPERTY_OPTS,
    );
  });

  it('should read the latest value closure for any sequence of state changes', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        async (suffixes) => {
          let setSuffix: (v: string) => void = () => {};
          let ctx: ReturnType<typeof useAgentActions> | null = null;

          function Harness() {
            const [suffix, setter] = React.useState(suffixes[0]);
            setSuffix = setter;
            useAgentAction({
              ...valueAction,
              steps: [{ label: 'type', value: (p) => `${p.tag}-${suffix}`, target: 'input' }],
            });
            return <AgentTarget name="input"><input data-testid="input" /></AgentTarget>;
          }
          render(
            <AgentActionProvider mode="instant">
              <Harness />
              <TestConsumer onContext={(c) => (ctx = c)} />
            </AgentActionProvider>,
          );

          for (const suffix of suffixes) {
            act(() => setSuffix(suffix));
            await act(() => ctx!.execute('value_test', { tag: 'x' }));
            expect((document.querySelector('[data-testid="input"]') as HTMLInputElement).value).toBe(`x-${suffix}`);
          }
          cleanup();
        },
      ),
      DOM_PROPERTY_OPTS,
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('should return error for any unknown action name', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (name) => {
        let ctx: ReturnType<typeof useAgentActions> | null = null;
        render(
          <AgentActionProvider>
            <TestConsumer onContext={(c) => (ctx = c)} />
          </AgentActionProvider>,
        );
        const result = await act(() => ctx!.execute(name));
        expect(result.error).toBeDefined();
        expect(result.error).toContain('not found');
        cleanup();
      }),
      DOM_PROPERTY_OPTS,
    );
  });

  it('should return disabledReason for any reason string', { timeout: DOM_TIMEOUT }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (reason) => {
        const action = defineAction({ name: 'disabled_test', description: 'Disabled' });
        let ctx: ReturnType<typeof useAgentActions> | null = null;
        render(
          <AgentActionProvider mode="instant">
            <AgentAction action={action} disabledReason={reason}>
              <button>Go</button>
            </AgentAction>
            <TestConsumer onContext={(c) => (ctx = c)} />
          </AgentActionProvider>,
        );
        const result = await act(() => ctx!.execute('disabled_test'));
        expect(result.error).toBeDefined();
        expect(result.error).toBe(reason);
        cleanup();
      }),
      DOM_PROPERTY_OPTS,
    );
  });
});

// ---------------------------------------------------------------------------
// Zod param validation
// ---------------------------------------------------------------------------

describe('param validation', () => {
  it('should fail when required Zod params are missing', async () => {
    const action = defineAction({
      name: 'validated',
      description: 'Validated',
      parameters: z.object({ ids: z.array(z.number()) }),
    });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[action]}>
        <AgentAction action={action}><button>Go</button></AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('validated', {}));
    expect(result.error).toBeDefined();
    expect(result.error).toContain('ids');
  });

  it('should pass when required params are provided', async () => {
    const action = defineAction({
      name: 'validated',
      description: 'Validated',
      parameters: z.object({ ids: z.array(z.number()) }),
    });
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" registry={[action]}>
        <AgentAction action={action}><button onClick={onClick}>Go</button></AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('validated', { ids: [1, 2] }));
    expect(result.error).toBeUndefined();
    expect(onClick).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// waitFor
// ---------------------------------------------------------------------------

describe('waitFor', () => {
  it('should await ref promise before resolving', async () => {
    const action = defineAction({ name: 'wait_ref', description: 'Wait ref' });
    let resolve: () => void;
    const promiseRef = { current: new Promise<void>((r) => { resolve = r; }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={promiseRef}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    let done = false;
    const exec = act(() => ctx!.execute('wait_ref').then((r) => { done = true; return r; }));
    expect(done).toBe(false);
    resolve!();
    const result = await exec;
    expect(result.error).toBeUndefined();
    expect(done).toBe(true);
  });

  it('surfaces the resolved waitFor value as result.outcome', async () => {
    const action = defineAction({ name: 'wait_outcome', description: 'Wait outcome' });
    let resolve: (v: unknown) => void;
    const promiseRef = { current: new Promise<unknown>((r) => { resolve = r; }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={promiseRef}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const exec = act(() => ctx!.execute('wait_outcome').then((r) => r));
    resolve!({ applied: true, confirmationShown: false, propertyCount: 1 });
    const result = await exec;
    expect(result.error).toBeUndefined();
    expect(result.outcome).toEqual({ applied: true, confirmationShown: false, propertyCount: 1 });
  });

  it('cancels an in-flight waitFor when a new execution starts', async () => {
    const action = defineAction({ name: 'wait_ref', description: 'Wait ref' });
    let resolve: () => void;
    const promiseRef = { current: new Promise<void>((r) => { resolve = r; }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={promiseRef}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    let first!: Promise<ExecutionResult>;
    await act(async () => {
      first = ctx!.execute('wait_ref');
      await Promise.resolve();
    });

    let second!: Promise<ExecutionResult>;
    await act(async () => {
      second = ctx!.execute('wait_ref');
      await Promise.resolve();
    });

    await expect(first).resolves.toMatchObject({ error: 'Execution cancelled' });

    resolve!();
    const result = await act(() => second);
    expect(result.error).toBeUndefined();
  });

  it('keeps isExecuting true when a new execution supersedes an in-flight one', async () => {
    const action = defineAction({ name: 'wait_ref', description: 'Wait ref' });
    let resolve: () => void;
    const promiseRef = { current: new Promise<void>((r) => { resolve = r; }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={promiseRef}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    let first!: Promise<ExecutionResult>;
    await act(async () => {
      first = ctx!.execute('wait_ref');
      await Promise.resolve();
    });
    expect(ctx!.isExecuting).toBe(true);

    // The second execution supersedes the first. The first's finally must NOT
    // clobber isExecuting back to false while the second is still running —
    // consumers that edge-detect isExecuting (the agent "view changed" toast,
    // the rank=0 Auto-Optimize shortcut) would otherwise see a spurious
    // true→false→true mid-sequence.
    let second!: Promise<ExecutionResult>;
    await act(async () => {
      second = ctx!.execute('wait_ref');
      await Promise.resolve();
    });
    await expect(first).resolves.toMatchObject({ error: 'Execution cancelled' });
    expect(ctx!.isExecuting).toBe(true);

    // Completing the live execution returns to idle.
    resolve!();
    await act(() => second);
    expect(ctx!.isExecuting).toBe(false);
  });

  it('resets isExecuting when execution is aborted', async () => {
    const action = defineAction({ name: 'wait_ref', description: 'Wait ref' });
    const promiseRef = { current: new Promise<void>(() => { /* never resolves */ }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={promiseRef}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    let exec!: Promise<ExecutionResult>;
    await act(async () => {
      exec = ctx!.execute('wait_ref');
      await Promise.resolve();
    });
    expect(ctx!.isExecuting).toBe(true);

    await act(async () => {
      ctx!.abortExecution();
      await Promise.resolve();
    });
    expect(ctx!.isExecuting).toBe(false);
    await expect(exec).resolves.toMatchObject({ error: 'Execution cancelled' });
  });
});

// ---------------------------------------------------------------------------
// Execution callbacks
// ---------------------------------------------------------------------------

describe('resolution diagnostics', () => {
  it('records resolve diagnostics on the step trace when a target is found', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({
        ...valueAction,
        steps: [{ label: 'type', value: 'x', target: 'input' }],
      });
      return <AgentTarget name="input"><input data-testid="input" /></AgentTarget>;
    }
    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('value_test', {}));
    const step = result.trace.find((s) => s.targetName === 'input');
    expect(step?.resolve).toBeDefined();
    expect(step?.resolve?.reason).toBe('found');
    expect(step?.resolve?.matchCount).toBeGreaterThanOrEqual(1);
  });

  // Regression: AgentActionProvider must forward `debug` into the executor's
  // config. Without this, the executor's log() calls (execute:start, step:done,
  // step:fail, etc.) all silently no-op even when the user passes debug={true}.
  it('forwards debug=true to the executor so execute:* log lines emit', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({
        ...valueAction,
        steps: [{ label: 'click', target: 'btn' }],
      });
      return <AgentTarget name="btn"><button data-testid="btn">Go</button></AgentTarget>;
    }
    render(
      <AgentActionProvider mode="instant" debug>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('value_test', {}));
    const events = spy.mock.calls.map((c) => c[0]);
    expect(events).toContain('[polter] execute:start');
    expect(events).toContain('[polter] step:done');
    expect(events).toContain('[polter] execute:complete');
    spy.mockRestore();
  });
});

describe('execution callbacks', () => {
  it('should fire onExecutionStart and onExecutionComplete', async () => {
    const action = defineAction({ name: 'tracked', description: 'Tracked' });
    const onStart = vi.fn();
    const onComplete = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" onExecutionStart={onStart} onExecutionComplete={onComplete}>
        <AgentAction action={action}><button>Go</button></AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('tracked'));
    expect(onStart).toHaveBeenCalledWith('tracked');
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ actionName: 'tracked' }));
  });
});

// ---------------------------------------------------------------------------
// Cross-page navigation handoff
//
// A cross-page action (registry schema with `navigateTo` but no steps of its
// own) gets its real steps from the destination page's component, which only
// mounts after navigation. The provider must wait for that mount, then run
// phase 2 — and if the component never shows up, report failure rather than a
// bare-navigation "success" (which makes the agent narrate, e.g., an opened
// panel that never opened).
// ---------------------------------------------------------------------------

describe('cross-page navigation handoff', () => {
  const crossPage = defineAction({
    name: 'open_panel',
    description: 'Open a panel that lives on another page',
    navigateTo: 'dash-nav',
  });
  // Stable reference — real callers pass a module-level registry, not an inline
  // array. A fresh array each render would churn the provider's registry
  // identity and defeat the registry-vs-component check the handoff relies on.
  const REGISTRY = [crossPage];

  it('reports an error (not a bare-nav success) when the destination component never mounts', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" mountTimeout={50} registry={REGISTRY}>
        <AgentTarget name="dash-nav"><button>Dashboard</button></AgentTarget>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('open_panel'));
    // Navigation itself happened…
    expect(result.trace.some((s) => s.targetName === 'dash-nav')).toBe(true);
    // …but the panel's own steps never ran, so this must NOT look like success.
    expect(result.error).toBeDefined();
  });

  it('runs the destination component’s steps once it mounts after navigation', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Late() {
      useAgentAction({ ...crossPage, steps: [{ label: 'open', target: 'panel-btn' }] });
      return <AgentTarget name="panel-btn"><button data-testid="panel-btn">Open</button></AgentTarget>;
    }
    const Tree = ({ mounted }: { mounted: boolean }) => (
      <AgentActionProvider mode="instant" mountTimeout={2000} registry={REGISTRY}>
        <AgentTarget name="dash-nav"><button>Dashboard</button></AgentTarget>
        {mounted ? <Late /> : null}
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>
    );
    const { rerender } = render(<Tree mounted={false} />);

    let resultP: Promise<ExecutionResult> | null = null;
    await act(async () => {
      resultP = ctx!.execute('open_panel'); // phase 1 navigates, then waits for mount
      rerender(<Tree mounted />); // destination component mounts during the wait
    });
    const result = await act(() => resultP!);

    expect(result.error).toBeUndefined();
    expect(
      result.trace.some((s) => s.targetName === 'panel-btn' && s.status === 'completed'),
    ).toBe(true);
  });
});
