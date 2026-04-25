import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { AgentStep } from '../components/AgentStep';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentActions } from '../hooks/useAgentActions';
import { defineAction } from '../core/defineAction';
import { z } from 'zod';
import { TestConsumer } from './testUtils';

// Action definitions used across tests
const exportCsvAction = defineAction({ name: 'export_csv', description: 'Export to CSV' });
const syncAction = defineAction({
  name: 'sync',
  description: 'Sync data',
  parameters: z.object({ ids: z.array(z.number()) }),
});
const pushAction = defineAction({ name: 'push', description: 'Push changes' });
const tempAction = defineAction({ name: 'temp', description: 'Temporary' });
const noChildrenAction = defineAction({ name: 'no_children', description: 'No children' });
const disabledAction = defineAction({ name: 'disabled_action', description: 'Disabled' });
const runAction = defineAction({ name: 'run', description: 'Run' });
const clickTestAction = defineAction({ name: 'click_test', description: 'Click test' });
const trackedAction = defineAction({ name: 'tracked', description: 'Tracked' });
const multiAction = defineAction({ name: 'multi', description: 'Multi-step' });
const aAction = defineAction({ name: 'a', description: 'A' });

describe('AgentActionProvider', () => {
  it('renders children', () => {
    render(
      <AgentActionProvider>
        <div data-testid="child">Hello</div>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('provides context with default values', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.mode).toBe('guided');
    expect(ctx!.isExecuting).toBe(false);
    expect(ctx!.schemas).toEqual([]);
    expect(ctx!.availableActions).toEqual([]);
  });

  it('respects mode prop', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.mode).toBe('instant');
  });
});

describe('AgentAction', () => {
  it('throws when used outside provider', () => {
    expect(() => render(<AgentAction action={exportCsvAction} />)).toThrow(
      'AgentAction must be used within an AgentActionProvider',
    );
  });

  it('registers action and appears in availableActions', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={exportCsvAction}>
          <button>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toEqual([
      { name: 'export_csv', description: 'Export to CSV', disabled: false, disabledReason: undefined, hasParameters: false },
    ]);
  });

  it('generates schemas from Zod parameters', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={syncAction}>
          <button>Sync</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.schemas).toHaveLength(1);
    expect(ctx!.schemas[0].name).toBe('sync');
    expect(ctx!.schemas[0].parameters).toEqual({
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'number' } } },
      required: ['ids'],
    });
  });

  it('excludes disabled actions from schemas but includes in availableActions', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={pushAction} disabled disabledReason="Nothing to push">
          <button>Push</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].disabled).toBe(true);
    expect(ctx!.availableActions[0].disabledReason).toBe('Nothing to push');
    expect(ctx!.schemas).toHaveLength(0);
  });

  it('unregisters action on unmount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider>
        <AgentAction action={tempAction}>
          <button>Temp</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);

    rerender(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(0);
  });

  it('renders nothing when no children provided', () => {
    const { container } = render(
      <AgentActionProvider>
        <AgentAction action={noChildrenAction} />
      </AgentActionProvider>,
    );
    expect(container.querySelector('[style*="display: contents"]')).toBeNull();
  });
});

describe('AgentAction execute', () => {
  it('returns error for unknown action', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('nonexistent'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for disabled action', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={disabledAction} disabled disabledReason="Not ready">
          <button>Disabled</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('disabled_action'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not ready');
  });

  it('calls waitFor function in instant mode', async () => {
    const waitFor = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={runAction} waitFor={waitFor}>
          <button>Run</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('run', { foo: 'bar' }));
    expect(result.success).toBe(true);
    expect(waitFor).toHaveBeenCalled();
  });

  it('waits for ref promise in instant mode', async () => {
    let resolve: () => void;
    const promiseRef = { current: new Promise<void>((r) => { resolve = r; }) };
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={runAction} waitFor={promiseRef}>
          <button>Run</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    let done = false;
    const exec = act(() => ctx!.execute('run', { foo: 'bar' }).then((r) => { done = true; return r; }));
    expect(done).toBe(false);
    resolve!();
    const result = await exec;
    expect(result.success).toBe(true);
    expect(done).toBe(true);
  });

  it('clicks element in instant mode', async () => {
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={clickTestAction}>
          <button onClick={onClick}>Click me</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('click_test'));
    expect(result.success).toBe(true);
    expect(onClick).toHaveBeenCalled();
  });

  it('fires onExecutionStart and onExecutionComplete callbacks', async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant" onExecutionStart={onStart} onExecutionComplete={onComplete}>
        <AgentAction action={trackedAction}>
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('tracked'));
    expect(onStart).toHaveBeenCalledWith('tracked');
    expect(onComplete).toHaveBeenCalledWith({ success: true, actionName: 'tracked' });
  });
});

describe('AgentStep', () => {
  it('throws when used outside AgentAction', () => {
    expect(() =>
      render(
        <AgentActionProvider>
          <AgentStep label="Bad step">
            <button>Step</button>
          </AgentStep>
        </AgentActionProvider>,
      ),
    ).toThrow('AgentStep must be used within an AgentAction');
  });

  it('renders children inside AgentAction', () => {
    render(
      <AgentActionProvider>
        <AgentAction action={multiAction}>
          <AgentStep label="First step">
            <button data-testid="step-btn">Step 1</button>
          </AgentStep>
        </AgentAction>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('step-btn')).toBeInTheDocument();
  });
});

describe('AgentStep skipIf', () => {
  it('skips the step click when skipIf returns true', async () => {
    const click1 = vi.fn();
    const click2 = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <AgentStep label="one" skipIf={() => true}>
            <button onClick={click1}>1</button>
          </AgentStep>
          <AgentStep label="two">
            <button onClick={click2}>2</button>
          </AgentStep>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('a'));
    expect(click1).not.toHaveBeenCalled();
    expect(click2).toHaveBeenCalled();
  });

  it('runs the step when skipIf returns false', async () => {
    const click = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <AgentStep label="one" skipIf={() => false}>
            <button onClick={click}>1</button>
          </AgentStep>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalled();
  });

  it('passes action params to the skipIf predicate', async () => {
    const click = vi.fn();
    const predicate = vi.fn((p: Record<string, unknown>) => p.skip === true);
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <AgentStep label="one" skipIf={predicate}>
            <button onClick={click}>1</button>
          </AgentStep>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('a', { skip: true, other: 'y' }));
    expect(predicate).toHaveBeenCalledWith({ skip: true, other: 'y' });
    expect(click).not.toHaveBeenCalled();
  });

  it('reads the latest skipIf closure after the step rerenders', async () => {
    const click = vi.fn();
    let setShouldSkip: (v: boolean) => void = () => {};

    function Harness() {
      const [shouldSkip, setter] = React.useState(false);
      setShouldSkip = setter;
      return (
        <AgentStep label="one" skipIf={() => shouldSkip}>
          <button onClick={click}>1</button>
        </AgentStep>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);

    act(() => setShouldSkip(true));

    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('tracks the latest skipIf closure across many flips', async () => {
    const click = vi.fn();
    let setShouldSkip: (v: boolean) => void = () => {};

    function Harness() {
      const [shouldSkip, setter] = React.useState(false);
      setShouldSkip = setter;
      return (
        <AgentStep label="one" skipIf={() => shouldSkip}>
          <button onClick={click}>1</button>
        </AgentStep>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    let expectedCount = 0;
    const sequence = [false, true, false, true, true, false, false, true];
    for (const shouldSkip of sequence) {
      act(() => setShouldSkip(shouldSkip));
      await act(() => ctx!.execute('a'));
      if (!shouldSkip) expectedCount += 1;
      expect(click).toHaveBeenCalledTimes(expectedCount);
    }
  });

  it('handles skipIf toggling between defined and undefined', async () => {
    const click = vi.fn();
    let setState: (v: { pass: boolean; skip: boolean }) => void = () => {};

    function Harness() {
      const [state, setter] = React.useState({ pass: false, skip: false });
      setState = setter;
      return (
        <AgentStep
          label="one"
          skipIf={state.pass ? () => state.skip : undefined}
        >
          <button onClick={click}>1</button>
        </AgentStep>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // No skipIf at all — runs.
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);

    // skipIf now present and returns true — skips.
    act(() => setState({ pass: true, skip: true }));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);

    // skipIf still present but returns false — runs.
    act(() => setState({ pass: true, skip: false }));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(2);

    // skipIf removed — runs.
    act(() => setState({ pass: false, skip: true }));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(3);
  });

  it('does not reorder steps when skipIf changes reference on rerender', async () => {
    const clicks: string[] = [];
    let setShouldSkip: (v: boolean) => void = () => {};

    function Harness() {
      const [shouldSkip, setter] = React.useState(false);
      setShouldSkip = setter;
      return (
        <>
          <AgentStep label="a">
            <button onClick={() => clicks.push('a')}>a</button>
          </AgentStep>
          <AgentStep label="b" skipIf={() => shouldSkip}>
            <button onClick={() => clicks.push('b')}>b</button>
          </AgentStep>
          <AgentStep label="c">
            <button onClick={() => clicks.push('c')}>c</button>
          </AgentStep>
        </>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    act(() => setShouldSkip(false));
    act(() => setShouldSkip(false));
    act(() => setShouldSkip(false));

    await act(() => ctx!.execute('a'));
    expect(clicks).toEqual(['a', 'b', 'c']);
  });

  it('handles skipIf swapping between distinct stable lambdas from a map', async () => {
    const click = vi.fn();
    let setRule: (k: 'allow' | 'block') => void = () => {};

    const allow = vi.fn((_p: Record<string, unknown>) => false);
    const block = vi.fn((_p: Record<string, unknown>) => true);
    const rules: Record<'allow' | 'block', (p: Record<string, unknown>) => boolean> = {
      allow,
      block,
    };

    function Harness() {
      const [key, setter] = React.useState<'allow' | 'block'>('allow');
      setRule = setter;
      return (
        <AgentStep label="one" skipIf={rules[key]}>
          <button onClick={click}>1</button>
        </AgentStep>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(block).not.toHaveBeenCalled();

    act(() => setRule('block'));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(block).toHaveBeenCalledTimes(1);

    act(() => setRule('allow'));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(2);
    expect(allow).toHaveBeenCalledTimes(2);
    expect(block).toHaveBeenCalledTimes(1);
  });

  it('keeps skipIf fresh when an unrelated prop change triggers re-registration', async () => {
    const click = vi.fn();
    let setState: (v: { label: string; skip: boolean }) => void = () => {};

    function Harness() {
      const [state, setter] = React.useState({ label: 'first', skip: false });
      setState = setter;
      return (
        <AgentStep label={state.label} skipIf={() => state.skip}>
          <button onClick={click}>1</button>
        </AgentStep>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction action={aAction}>
          <Harness />
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);

    // Flipping `label` forces the registration effect to re-fire (label is in
    // deps). Simultaneously flip skip to true. After re-registration, the
    // stable skipIf wrapper must still read the latest closure.
    act(() => setState({ label: 'second', skip: true }));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(1);

    // Flip back — another re-registration, skip flips to false again.
    act(() => setState({ label: 'third', skip: false }));
    await act(() => ctx!.execute('a'));
    expect(click).toHaveBeenCalledTimes(2);
  });
});

describe('AgentTarget', () => {
  it('throws when used outside provider', () => {
    expect(() =>
      render(
        <AgentTarget action="test" param="id" value="1">
          <div>Target</div>
        </AgentTarget>,
      ),
    ).toThrow('AgentTarget must be used within an AgentActionProvider');
  });

  it('renders children inside provider', () => {
    render(
      <AgentActionProvider>
        <AgentTarget action="filter" param="tag" value="urgent">
          <span data-testid="target-el">Urgent</span>
        </AgentTarget>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('target-el')).toBeInTheDocument();
  });
});

