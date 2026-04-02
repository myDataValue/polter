import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { AgentStep } from '../components/AgentStep';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentActions } from '../hooks/useAgentActions';
import { z } from 'zod';

function TestConsumer({ onContext }: { onContext: (ctx: ReturnType<typeof useAgentActions>) => void }) {
  const ctx = useAgentActions();
  React.useEffect(() => {
    onContext(ctx);
  });
  return null;
}

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
    expect(() => render(<AgentAction name="test" description="Test" />)).toThrow(
      'AgentAction must be used within an AgentActionProvider',
    );
  });

  it('registers action and appears in availableActions', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction name="export_csv" description="Export to CSV">
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
        <AgentAction
          name="sync"
          description="Sync data"
          parameters={z.object({ ids: z.array(z.number()) })}
        >
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
        <AgentAction name="push" description="Push changes" disabled disabledReason="Nothing to push">
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
        <AgentAction name="temp" description="Temporary">
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
        <AgentAction name="no_children" description="No children" />
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
        <AgentAction name="disabled_action" description="Disabled" disabled disabledReason="Not ready">
          <button>Disabled</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('disabled_action'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not ready');
  });

  it('calls onExecute in instant mode', async () => {
    const onExecute = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction name="run" description="Run" onExecute={onExecute}>
          <button>Run</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    const result = await act(() => ctx!.execute('run', { foo: 'bar' }));
    expect(result.success).toBe(true);
    expect(onExecute).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('clicks element in instant mode without onExecute', async () => {
    const onClick = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <AgentAction name="click_test" description="Click test">
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
        <AgentAction name="tracked" description="Tracked" onExecute={() => {}}>
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
        <AgentAction name="multi" description="Multi-step">
          <AgentStep label="First step">
            <button data-testid="step-btn">Step 1</button>
          </AgentStep>
        </AgentAction>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('step-btn')).toBeInTheDocument();
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
