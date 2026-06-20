import { fc, it as fcIt } from '@fast-check/vitest';
import { render, screen } from '@testing-library/react';
// biome-ignore lint/correctness/noUnusedImports: grandfathered at Biome adoption — fix and remove over time
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentAction } from '../components/AgentAction';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentTarget } from '../components/AgentTarget';
import { defineAction } from '../core/helpers';
import { useAgentAction } from '../hooks/useAgentAction';
import { useAgentActions } from '../hooks/useAgentActions';
import { TestConsumer } from './testUtils';

// ---------------------------------------------------------------------------
// Context error boundaries — all hooks/components throw outside provider
// ---------------------------------------------------------------------------

describe('context boundaries', () => {
  it.each([
    {
      name: 'useAgentActions',
      render: () => {
        function Bad() {
          useAgentActions();
          return null;
        }
        return <Bad />;
      },
    },
    {
      name: 'useAgentAction',
      render: () => {
        function Bad() {
          useAgentAction(defineAction({ name: 'x', description: 'x' }));
          return null;
        }
        return <Bad />;
      },
    },
    {
      name: 'AgentAction',
      render: () => <AgentAction action={defineAction({ name: 'x', description: 'x' })} />,
    },
    {
      name: 'AgentTarget',
      render: () => (
        <AgentTarget name="x">
          <div />
        </AgentTarget>
      ),
    },
  ])('$name should throw when used outside AgentActionProvider', ({ render: renderEl }) => {
    expect(() => render(renderEl())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Critical misconfig guard: steps in BOTH defineAction and useAgentAction is
// logged loudly (console.error). It deliberately does NOT throw — registerAction
// runs in a React effect, and an effect that throws unmounts the whole tree
// (one misconfigured action would white-screen the app).
// ---------------------------------------------------------------------------

function loggedStepsInBoth(spy: ReturnType<typeof vi.spyOn>): boolean {
  return spy.mock.calls.some(
    (args: unknown[]) =>
      typeof args[0] === 'string' && (args[0] as string).includes('steps in both'),
  );
}

describe('critical misconfiguration guards', () => {
  // The registry prop is synced into the provider in an effect, and child effects
  // run before the parent's — so mount the provider first (registry settles), then
  // rerender to mount the component. Mirrors how real components register after the
  // provider, and the cross-page test's registry handoff.
  it('console.errors when an action has steps in both defineAction and useAgentAction', () => {
    const dup = defineAction({
      name: 'dup_steps',
      description: 'has steps in the registry',
      steps: [{ label: 'click', target: 'btn' }],
    });
    const REGISTRY = [dup];
    function Comp() {
      useAgentAction({ ...dup }); // spread re-adds the registry steps → two places
      return null;
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <AgentActionProvider registry={REGISTRY}>{null}</AgentActionProvider>,
    );
    rerender(
      <AgentActionProvider registry={REGISTRY}>
        <Comp />
      </AgentActionProvider>,
    );
    const flagged = loggedStepsInBoth(errSpy);
    errSpy.mockRestore();
    expect(flagged).toBe(true);
  });

  it('does NOT flag the canonical split (steps only in the component, stepless registry stand-in)', () => {
    const standIn = defineAction({ name: 'split_ok', description: 'stand-in', navigateTo: 'nav' });
    const REGISTRY = [standIn];
    function Comp() {
      useAgentAction({ ...standIn, steps: [{ label: 'click', target: 'btn' }] });
      return null;
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <AgentActionProvider registry={REGISTRY}>{null}</AgentActionProvider>,
    );
    rerender(
      <AgentActionProvider registry={REGISTRY}>
        <Comp />
      </AgentActionProvider>,
    );
    const flagged = loggedStepsInBoth(errSpy);
    errSpy.mockRestore();
    expect(flagged).toBe(false);
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

  it.each(['guided', 'instant'] as const)('should expose mode=%s through context', (mode) => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode={mode}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.mode).toBe(mode);
  });

  it('should start with empty actions and schemas', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toEqual([]);
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.schemas).toEqual([]);
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
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
          <AgentAction action={action}>
            {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
            <button>Go</button>
          </AgentAction>
          <TestConsumer onContext={(c) => (ctx = c)} />
        </AgentActionProvider>,
      );
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      expect(ctx!.availableActions).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      expect(ctx!.availableActions[0].name).toBe(name);
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      expect(ctx!.availableActions[0].description).toBe(description);
      unmount();
    },
  );

  it('should unregister action on unmount', () => {
    const action = defineAction({ name: 'temp', description: 'Temp' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider>
        <AgentAction action={action}>
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(1);

    rerender(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(0);
  });

  it('should exclude disabled actions from schemas but include in availableActions', () => {
    const action = defineAction({
      name: 'locked',
      description: 'Locked',
      parameters: z.object({ x: z.string() }),
    });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider>
        <AgentAction action={action} disabledReason="Not ready">
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button>Go</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions[0].disabledReason).toBe('Not ready');
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
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
    function Harness() {
      useAgentAction(solo);
      return null;
    }
    render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions.map((a) => a.name)).toEqual(['solo']);
  });

  it('should register multiple actions in one call', () => {
    const alpha = defineAction({ name: 'alpha', description: 'Alpha' });
    const beta = defineAction({ name: 'beta', description: 'Beta' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction(alpha, beta);
      return null;
    }
    render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions.map((a) => a.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('should unregister on unmount', () => {
    const tempDef = defineAction({ name: 'temp', description: 'Temp' });
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    function Harness() {
      useAgentAction(tempDef);
      return null;
    }
    const { rerender } = render(
      <AgentActionProvider>
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(1);
    rerender(
      <AgentActionProvider>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Registry lifecycle
// ---------------------------------------------------------------------------

const exportCsv = defineAction({
  name: 'export_csv',
  description: 'Export CSV',
  navigateTo: 'export-tab',
});
const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant access',
  parameters: z.object({ property_ids: z.array(z.number()) }),
  navigateTo: ['settings-tab', 'grant-link'],
});

describe('registry', () => {
  it('should register defineAction schemas before component mount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider registry={[exportCsv, grantAccess]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(2);
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.schemas).toHaveLength(2);
  });

  it('should let component override registry, and restore on unmount', () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    const { rerender } = render(
      <AgentActionProvider registry={[exportCsv]}>
        <AgentAction action={exportCsv}>
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button>Export</button>
        </AgentAction>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(1);

    rerender(
      <AgentActionProvider registry={[exportCsv]}>
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    expect(ctx!.availableActions).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
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
