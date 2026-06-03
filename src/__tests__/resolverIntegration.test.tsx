import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentTarget } from '../components/AgentTarget';
import { useAgentAction } from '../hooks/useAgentAction';
import { useAgentActions } from '../hooks/useAgentActions';
import { defineAction } from '../core/helpers';
import { TestConsumer } from './testUtils';

// End-to-end proof that a step's `intent` flows AgentTarget(meta) -> registry ->
// resolveTarget -> matchTargets -> the DOM element, with no exact-name match.
describe('flexible intent resolution (integration)', () => {
  function TypeRows({ onApartments }: { onApartments: () => void }) {
    return (
      <>
        <AgentTarget
          name="type-row:201|219"
          role="type"
          attrs={{ label: 'Apartments', ids: ['201', '219'], level: 'CITY' }}
        >
          <button onClick={onApartments}>Apartments</button>
        </AgentTarget>
        <AgentTarget
          name="type-row:213"
          role="type"
          attrs={{ label: 'Villas', ids: ['213'], level: 'CITY' }}
        >
          <button>Villas</button>
        </AgentTarget>
      </>
    );
  }

  it('resolves a partial id-set intent to the full type-group row (no exact name)', async () => {
    const action = defineAction({ name: 'pick_type', description: 'Pick a type' });
    const onApartments = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;

    function Harness() {
      useAgentAction({
        ...action,
        steps: [{ label: 'select type', intent: { role: 'type', attrs: { ids: ['201'] } } }],
      });
      return <TypeRows onApartments={onApartments} />;
    }

    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    const result = await act(() => ctx!.execute('pick_type'));
    expect(result.error).toBeUndefined();
    // ['201'] is a subset of the Apartments row's ['201','219'] — Villas is disjoint.
    expect(onApartments).toHaveBeenCalledTimes(1);
  });

  it('resolves by label when the agent has no id', async () => {
    const action = defineAction({ name: 'pick_villas', description: 'Pick villas' });
    const onApartments = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;

    function Harness() {
      useAgentAction({
        ...action,
        steps: [{ label: 'select', intent: { role: 'type', attrs: { label: 'villas' } } }],
      });
      // Apartments has the onClick; Villas does not — so a correct resolve must NOT click Apartments.
      return <TypeRows onApartments={onApartments} />;
    }

    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    const result = await act(() => ctx!.execute('pick_villas'));
    expect(result.error).toBeUndefined();
    expect(onApartments).not.toHaveBeenCalled(); // matched Villas, not Apartments
  });

  it('clicks an operator already visible in the leaderboard by id — no search box', async () => {
    // The COORIE case: a "click-only" step (short timeout, intent, no search) resolves the
    // operator's already-rendered leaderboard row and clicks it like a human who can see it.
    const action = defineAction({ name: 'pick_op', description: 'Pick operator' });
    const onCoorie = vi.fn();
    let ctx: ReturnType<typeof useAgentActions> | null = null;

    function Harness() {
      useAgentAction({
        ...action,
        steps: [
          { label: 'select op', timeout: 1200, intent: { role: 'operator', attrs: { id: '405776' } } },
        ],
      });
      return (
        <>
          <AgentTarget name="op:405776" role="operator" attrs={{ id: '405776', label: 'COORIE HOME STAYS LTD' }}>
            <button onClick={onCoorie}>COORIE HOME STAYS LTD</button>
          </AgentTarget>
          <AgentTarget name="op:15357642" role="operator" attrs={{ id: '15357642', label: 'GuestReady' }}>
            <button>GuestReady</button>
          </AgentTarget>
        </>
      );
    }

    render(
      <AgentActionProvider mode="instant">
        <Harness />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    const result = await act(() => ctx!.execute('pick_op'));
    expect(result.error).toBeUndefined();
    expect(onCoorie).toHaveBeenCalledTimes(1); // clicked the visible row by id, no search
  });

  // The "intent matches nothing" path is covered at the unit level by the matchTargets
  // 'miss' test. End-to-end it inherits Polter's existing component-backed polling (a
  // missing target is treated as "still loading"), so it is not asserted via the executor.
});
