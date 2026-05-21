import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

const DOM_PROPERTY_OPTS = { numRuns: 20 };
const DOM_TIMEOUT = 30_000;
import React from 'react';
import { flushSync } from 'react-dom';
import { render, act, cleanup } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentActions } from '../hooks/useAgentActions';
import { useAgentAction } from '../hooks/useAgentAction';
import { defineAction } from '../core/helpers';
import { fromParam } from '../core/helpers';
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
  it('should call waitFor function before resolving', async () => {
    const action = defineAction({ name: 'wait_fn', description: 'Wait fn' });
    const waitFor = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={action} waitFor={waitFor}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('wait_fn'));
    expect(result.error).toBeUndefined();
    expect(waitFor).toHaveBeenCalled();
  });

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
});

// ---------------------------------------------------------------------------
// Execution callbacks
// ---------------------------------------------------------------------------

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
// Target DOM-node replacement during execution — regression guard for the
// "step resolves an element, then the row gets recycled (e.g. by a
// virtualizer's scrollIntoView), then the click silently fires on the
// detached node" class of bugs.
// ---------------------------------------------------------------------------

describe('target stability across re-renders', () => {
  it(
    'clicks the currently-mounted target for any number of mid-step replacements',
    { timeout: DOM_TIMEOUT },
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (recycleCount) => {
          const clicks: number[] = [];
          let recycleRow: () => void = () => {};

          const action = defineAction({ name: 'click_target', description: 'Click' });

          function Harness() {
            const [version, setVersion] = React.useState(0);
            recycleRow = () => flushSync(() => setVersion((v) => v + 1));

            useAgentAction({
              ...action,
              steps: [{ label: 'click', target: 'btn' }],
            });

            // key={version} forces React to fully remount the subtree, so the
            // <button> is a different DOM node each time — the way a virtualizer
            // recycles a row.
            return (
              <AgentTarget key={version} name="btn">
                <button onClick={() => clicks.push(version)}>Go</button>
              </AgentTarget>
            );
          }

          let ctx: ReturnType<typeof useAgentActions> | null = null;
          const { container } = render(
            <AgentActionProvider
              mode="guided"
              stepDelay={0}
              cursorEnabled={false}
              tooltipEnabled={false}
            >
              <Harness />
              <TestConsumer onContext={(c) => (ctx = c)} />
            </AgentActionProvider>,
          );

          try {
            // Override scrollIntoView on this specific element only (not the
            // prototype), so the test stays isolated from other tests and from
            // other property iterations. When polter scrolls the resolved
            // element into view, we synchronously remount the row N times —
            // simulating a virtualizer (or any other re-render) replacing the
            // resolved node mid-step.
            const initialButton = container.querySelector('button') as HTMLElement;
            initialButton.scrollIntoView = () => {
              for (let i = 0; i < recycleCount; i++) recycleRow();
            };

            const result = await act(() => ctx!.execute('click_target'));

            expect(result.error).toBeUndefined();
            // The click should land on the currently-mounted instance, whose
            // closure captures `version === recycleCount`.
            expect(clicks).toEqual([recycleCount]);
          } finally {
            cleanup();
          }
        }),
        DOM_PROPERTY_OPTS,
      );
    },
  );
});
