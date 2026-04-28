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
import { defineAction } from '../core/defineAction';
import { fromParam } from '../core/stepHelpers';
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
    expect(result.success).toBe(true);
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
            action: valueAction,
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
              action: valueAction,
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
        action: valueAction,
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
            action: skipAction,
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
        action: skipAction,
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
              action: skipAction,
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
              action: valueAction,
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
        expect(result.success).toBe(false);
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
            <AgentAction action={action} disabled disabledReason={reason}>
              <button>Go</button>
            </AgentAction>
            <TestConsumer onContext={(c) => (ctx = c)} />
          </AgentActionProvider>,
        );
        const result = await act(() => ctx!.execute('disabled_test'));
        expect(result.success).toBe(false);
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
    expect(result.success).toBe(false);
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
    expect(result.success).toBe(true);
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
    expect(result.success).toBe(true);
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
    expect(result.success).toBe(true);
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
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true, actionName: 'tracked' }));
  });
});
