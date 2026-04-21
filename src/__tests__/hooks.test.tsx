import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { useAgentActions } from '../hooks/useAgentActions';
import { useAgentAction, AgentActionConfig } from '../hooks/useAgentAction';
import { TestConsumer } from './testUtils';

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
      useAgentAction({ name: 'a', description: 'A' });
      return null;
    }
    expect(() => render(<BadComponent />)).toThrow(
      'useAgentAction must be used within an AgentActionProvider',
    );
  });

  it.each<[string, AgentActionConfig | AgentActionConfig[], string[]]>([
    ['a single action config', { name: 'solo', description: 'Solo' }, ['solo']],
    [
      'an array of action configs',
      [
        { name: 'alpha', description: 'Alpha' },
        { name: 'beta', description: 'Beta' },
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
      useAgentAction({ name: 'temp', description: 'Temp' });
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
        name: 'has_skip',
        description: 'Has skip',
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
});
