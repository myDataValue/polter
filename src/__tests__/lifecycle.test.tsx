import { describe, expect, it } from 'vitest';
import { it as fcIt, fc } from '@fast-check/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentAction } from '../components/AgentAction';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentActions } from '../hooks/useAgentActions';
import { useAgentAction } from '../hooks/useAgentAction';
import { defineAction } from '../core/defineAction';
import { action } from '../core/stepHelpers';
import { z } from 'zod';
import { TestConsumer } from './testUtils';

// ---------------------------------------------------------------------------
// Context error boundaries — all hooks/components throw outside provider
// ---------------------------------------------------------------------------

describe('context boundaries', () => {
  it.each([
    {
      name: 'useAgentActions',
      render: () => {
        function Bad() { useAgentActions(); return null; }
        return <Bad />;
      },
    },
    {
      name: 'useAgentAction',
      render: () => {
        function Bad() { useAgentAction({ action: defineAction({ name: 'x', description: 'x' }), steps: [] }); return null; }
        return <Bad />;
      },
    },
    {
      name: 'AgentAction',
      render: () => <AgentAction action={defineAction({ name: 'x', description: 'x' })} />,
    },
    {
      name: 'AgentTarget',
      render: () => <AgentTarget name="x"><div /></AgentTarget>,
    },
  ])('$name should throw when used outside AgentActionProvider', ({ render: renderEl }) => {
    expect(() => render(renderEl())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Provider basics
// ---------------------------------------------------------------------------

describe('AgentActionProvider', () => {
  it('should render children', () => {
    render(
      <AgentActionProvider>
        <div data-testid="child">Hello</div>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it.each(['guided', 'instant'] as const)(
    'should expose mode=%s through context',
    (mode) => {
      let ctx: ReturnType<typeof useAgentActions> | null = null;
      render(
        <AgentActionProvider mode={mode}>
          <TestConsumer onContext={(c) => (ctx = c)} />
        </AgentActionProvider>,
      );
      expect(ctx!.mode).toBe(mode);
    },
  );

  it('should start with empty actions and schemas', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toEqual([]);
    expect(ctx!.schemas).toEqual([]);
    expect(ctx!.isExecuting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registration lifecycle — AgentAction
// ---------------------------------------------------------------------------

describe('AgentAction registration', () => {
  fcIt.prop([fc.string({ minLength: 1, maxLength: 30 }), fc.string({ minLength: 1 })])(
    'should register any action and appear in availableActions',
    (name, description) => {
      const action = defineAction({ name, description });
      let ctx: ReturnType<typeof useAgentActions> | null = null;
      const { unmount } = render(
        <AgentActionProvider>
          <AgentAction action={action}><button>Go</button></AgentAction>
          <TestConsumer onContext={(c) => (ctx = c)} />
        </AgentActionProvider>,
      );
      expect(ctx!.availableActions).toHaveLength(1);
      expect(ctx!.availableActions[0].name).toBe(name);
      expect(ctx!.availableActions[0].description).toBe(description);
      unmount();
    },
  );

  it('should unregister action on unmount', () => {
    const action = defineAction({ name: 'temp', description: 'Temp' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider>
        <AgentAction action={action}><button>Go</button></AgentAction>
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

  it('should exclude disabled actions from schemas but include in availableActions', () => {
    const action = defineAction({ name: 'locked', description: 'Locked', parameters: z.object({ x: z.string() }) });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={action} disabled disabledReason="Not ready">
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].disabled).toBe(true);
    expect(ctx!.availableActions[0].disabledReason).toBe('Not ready');
    expect(ctx!.schemas).toHaveLength(0);
  });

  it('should render nothing when no children provided', () => {
    const action = defineAction({ name: 'empty', description: 'Empty' });
    const { container } = render(
      <AgentActionProvider>
        <AgentAction action={action} />
      </AgentActionProvider>,
    );
    expect(container.querySelector('[style*="display: contents"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Registration lifecycle — useAgentAction
// ---------------------------------------------------------------------------

describe('useAgentAction registration', () => {
  it('should register a single action', () => {
    const solo = defineAction({ name: 'solo', description: 'Solo' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() { useAgentAction(action(solo)); return null; }
    render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions.map((a) => a.name)).toEqual(['solo']);
  });

  it('should register multiple actions in one call', () => {
    const alpha = defineAction({ name: 'alpha', description: 'Alpha' });
    const beta = defineAction({ name: 'beta', description: 'Beta' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() { useAgentAction(action(alpha), action(beta)); return null; }
    render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions.map((a) => a.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('should unregister on unmount', () => {
    const action = defineAction({ name: 'temp', description: 'Temp' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() { useAgentAction({ action, steps: [] }); return null; }
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
});

// ---------------------------------------------------------------------------
// Registry lifecycle
// ---------------------------------------------------------------------------

const exportCsv = defineAction({ name: 'export_csv', description: 'Export CSV', route: () => '/export' });
const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant access',
  parameters: z.object({ property_ids: z.array(z.number()) }),
  steps: [
    { label: 'Click Settings', target: 'settings-tab' },
    { label: 'Click Grant', target: 'grant-link' },
  ],
});

describe('registry', () => {
  it('should register defineAction schemas before component mount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider registry={[exportCsv, grantAccess]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(2);
    expect(ctx!.schemas).toHaveLength(2);
  });

  it('should let component override registry, and restore on unmount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider registry={[exportCsv]}>
        <AgentAction action={exportCsv}><button>Export</button></AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);

    rerender(
      <AgentActionProvider registry={[exportCsv]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    expect(ctx!.availableActions).toHaveLength(1);
    expect(ctx!.availableActions[0].name).toBe('export_csv');
  });
});

// ---------------------------------------------------------------------------
// AgentTarget
// ---------------------------------------------------------------------------

describe('AgentTarget', () => {
  it('should render children inside provider', () => {
    render(
      <AgentActionProvider>
        <AgentTarget name="tag:urgent">
          <span data-testid="target-el">Urgent</span>
        </AgentTarget>
      </AgentActionProvider>,
    );
    expect(screen.getByTestId('target-el')).toBeInTheDocument();
  });
});
