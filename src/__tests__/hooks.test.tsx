import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { useAgentActions } from '../hooks/useAgentActions';
import { useAgentAction, AgentActionConfig } from '../hooks/useAgentAction';
import { defineAction } from '../core/defineAction';
import { TestConsumer } from './testUtils';

const aAction = defineAction({ name: 'a', description: 'A' });
const soloAction = defineAction({ name: 'solo', description: 'Solo' });
const alphaAction = defineAction({ name: 'alpha', description: 'Alpha' });
const betaAction = defineAction({ name: 'beta', description: 'Beta' });
const tempAction = defineAction({ name: 'temp', description: 'Temp' });
const hasSkipAction = defineAction({ name: 'has_skip', description: 'Has skip' });
const reactiveSkipAction = defineAction({ name: 'reactive_skip', description: 'Reactive' });

describe('useAgentActions', () => {
  it('throws when used outside provider', () => {
    function BadComponent() {
      useAgentActions();
      return null;
    }
    expect(() => render(<BadComponent />)).toThrow(
      'useAgentActions must be used within an AgentActionProvider',
    );
  });
});

describe('useAgentAction', () => {
  it('throws when used outside provider', () => {
    function BadComponent() {
      useAgentAction({ action: aAction, steps: [] });
      return null;
    }
    expect(() => render(<BadComponent />)).toThrow(
      'useAgentAction must be used within an AgentActionProvider',
    );
  });

  it.each<[string, AgentActionConfig | AgentActionConfig[], string[]]>([
    ['a single action config', { action: soloAction, steps: [] }, ['solo']],
    [
      'an array of action configs',
      [
        { action: alphaAction, steps: [] },
        { action: betaAction, steps: [] },
      ],
      ['alpha', 'beta'],
    ],
  ])('registers %s', (_label, config, expectedNames) => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction(config);
      return null;
    }
    render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions.map((a) => a.name).sort()).toEqual(expectedNames);
  });

  it('unregisters actions on unmount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({ action: tempAction, steps: [] });
      return null;
    }
    const { rerender } = render(
      <AgentActionProvider>
        <Harness />
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

  it('invokes step skipIf at execute time with the action params', async () => {
    const skipIf = vi.fn(() => false);
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction({
        action: hasSkipAction,
        steps: [{ label: 'one', fromTarget: 'does-not-exist', skipIf }],
      });
      return null;
    }
    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    await act(() => ctx!.execute('has_skip', { k: 'v' }));
    expect(skipIf).toHaveBeenCalledWith({ k: 'v' });
  });

  it('reads the latest step skipIf closure after the component rerenders', async () => {
    // Regression guard: useAgentAction must look up the config via
    // configRef.current at execute time — not capture item.steps at effect
    // run time — so inline closures see the latest render's state.
    const observed: boolean[] = [];
    let setSkip: (v: boolean) => void = () => {};

    function Harness() {
      const [skip, setter] = React.useState(false);
      setSkip = setter;
      useAgentAction({
        action: reactiveSkipAction,
        steps: [
          {
            label: 's',
            fromTarget: 'does-not-exist',
            skipIf: () => {
              observed.push(skip);
              return skip;
            },
          },
        ],
      });
      return null;
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    await act(() => ctx!.execute('reactive_skip'));
    expect(observed).toEqual([false]);

    act(() => setSkip(true));
    await act(() => ctx!.execute('reactive_skip'));
    expect(observed).toEqual([false, true]);

    act(() => setSkip(false));
    await act(() => ctx!.execute('reactive_skip'));
    expect(observed).toEqual([false, true, false]);
  });
});
