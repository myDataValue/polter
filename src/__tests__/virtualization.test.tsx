import { act, cleanup, render, screen } from '@testing-library/react';
import React, { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  cleanup();
});

import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentTarget } from '../components/AgentTarget';
import { defineAction } from '../core/helpers';
import type { ExecutionResult } from '../core/types';
import { useAgentAction } from '../hooks/useAgentAction';
import type { useAgentActions } from '../hooks/useAgentActions';
import { TestConsumer } from './testUtils';

// PRO-184 reproduction — virtualized table + InlineEditableCell.
//
// The real-world scenario distilled to its smallest moving parts:
//
//   1. A virtualized list renders only a window of rows; rows outside the
//      window are unmounted. Tanstack-virtual recycles row DOM nodes when
//      its data input changes shape (refetch, re-sort, selection change).
//   2. Each row contains an InlineEditableCell that holds `editing` in
//      local useState. Clicking the cell sets editing=true, which mounts
//      an <input> wrapped in <AgentTarget name="acc-markup-input">.
//   3. Polter runs an action whose first step clicks the edit button and
//      whose second step types into the input.
//
// The bug fires when the row's React instance unmounts and remounts
// between step 1's click and step 2's type. Local `editing` useState
// resets to false on remount → the input is gone → polter polls forever.

const editAction = defineAction({ name: 'edit_markup', description: 'Edit' });

// ---------------------------------------------------------------------------
// Fake virtualizer — keeps an internal "rendered window" and unmounts rows
// outside it. Exposes scroll + force-recycle handles.
// ---------------------------------------------------------------------------

interface FakeVirtualizerHandle {
  scrollToProperty(id: number): void;
  /** Force a re-render that bumps row keys so React unmounts & remounts the
   *  row component — modeling tanstack-virtual recycling DOM nodes. */
  recycle(): void;
}

function FakeVirtualizer({
  properties,
  windowSize,
  renderRow,
  handleRef,
}: {
  properties: Array<{ id: number }>;
  windowSize: number;
  renderRow: (id: number) => React.ReactNode;
  handleRef: React.MutableRefObject<FakeVirtualizerHandle | null>;
}) {
  const [windowStart, setWindowStart] = useState(0);
  const [recycleVersion, setRecycleVersion] = useState(0);

  handleRef.current = {
    scrollToProperty(id) {
      const idx = properties.findIndex((p) => p.id === id);
      if (idx >= 0) flushSync(() => setWindowStart(Math.max(0, idx - Math.floor(windowSize / 2))));
    },
    recycle() {
      flushSync(() => setRecycleVersion((v) => v + 1));
    },
  };

  const visible = properties.slice(windowStart, windowStart + windowSize);
  return (
    <div data-testid="virtualizer">
      {visible.map((p) => (
        // Stable key on id when not recycling, but recycleVersion bumps
        // unmount-then-remount every row in the window.
        <React.Fragment key={`${p.id}:${recycleVersion}`}>{renderRow(p.id)}</React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineEditableCell — two variants for A/B comparison.
// ---------------------------------------------------------------------------

/** Production code path before PR #742: editing held in local useState. */
function CellWithLocalState({ propertyId }: { propertyId: number }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <AgentTarget name="acc-markup-input">
      <input data-testid={`input-${propertyId}`} />
    </AgentTarget>
  ) : (
    <AgentTarget name={`edit-${propertyId}`}>
      {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
      <button data-testid={`btn-${propertyId}`} onClick={() => setEditing(true)}>
        edit
      </button>
    </AgentTarget>
  );
}

/** Production code path after PR #742: editing held in a shared map keyed by
 *  `name:id`, lifted to a ref that lives above the row component. */
function CellWithSharedState({
  propertyId,
  meta,
}: {
  propertyId: number;
  meta: { editing: Map<string, boolean>; setEditing: (k: string, v: boolean) => void };
}) {
  const key = `acc-markup-input:${propertyId}`;
  const editing = meta.editing.get(key) ?? false;
  return editing ? (
    <AgentTarget name="acc-markup-input">
      <input data-testid={`input-${propertyId}`} />
    </AgentTarget>
  ) : (
    <AgentTarget name={`edit-${propertyId}`}>
      {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
      <button data-testid={`btn-${propertyId}`} onClick={() => meta.setEditing(key, true)}>
        edit
      </button>
    </AgentTarget>
  );
}

// ---------------------------------------------------------------------------
// Harness — wires polter to the fake virtualizer the way
// useTableAgentActions + CombinedTableView wire them in production.
// ---------------------------------------------------------------------------

function Harness({
  properties,
  cellMode,
  recycleAfterClick,
}: {
  properties: Array<{ id: number }>;
  cellMode: 'local' | 'shared';
  /** When true, every click also triggers a virtualizer recycle (microtask
   *  after the click commits) — modeling the production case where an
   *  unrelated refetch / sort / selection update re-renders the table. */
  recycleAfterClick: boolean;
}) {
  const virtualizerRef = useRef<FakeVirtualizerHandle | null>(null);
  const editingMapRef = useRef<Map<string, boolean>>(new Map());
  const [, setForce] = useState(0);
  const setEditing = useCallback((k: string, v: boolean) => {
    editingMapRef.current.set(k, v);
    setForce((x) => x + 1);
  }, []);

  // Mirrors useTableAgentActions for edit_booking_acc_markup.
  useAgentAction({
    ...editAction,
    steps: [
      {
        label: 'Click edit price',
        target: (p) => `edit-${String(p.property_id)}`,
        scrollTo: {
          dispatchEvent: 'agent:scroll-to',
          detail: (p) => ({ property_id: p.property_id }),
        },
      },
      { label: 'Set markup value', target: 'acc-markup-input', value: '25' },
    ],
  });

  // Mirrors CombinedTableView's window listener.
  React.useEffect(() => {
    const handler = (e: Event) => {
      virtualizerRef.current?.scrollToProperty((e as CustomEvent).detail.property_id);
    };
    window.addEventListener('agent:scroll-to', handler);
    return () => window.removeEventListener('agent:scroll-to', handler);
  }, []);

  // Recycle the virtualizer right after a click commits.
  React.useEffect(() => {
    if (!recycleAfterClick) return;
    const onClick = () => {
      queueMicrotask(() => virtualizerRef.current?.recycle());
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [recycleAfterClick]);

  return (
    <FakeVirtualizer
      properties={properties}
      windowSize={3}
      handleRef={virtualizerRef}
      renderRow={(id) =>
        cellMode === 'local' ? (
          <CellWithLocalState propertyId={id} />
        ) : (
          <CellWithSharedState
            propertyId={id}
            meta={{ editing: editingMapRef.current, setEditing }}
          />
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function race<T>(p: Promise<T>, ms: number): Promise<T | { __timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ __timedOut: true }>((r) => {
    timer = setTimeout(() => r({ __timedOut: true }), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** True when a `race()` result is the timeout sentinel rather than a real outcome. */
function timedOut(result: ExecutionResult | { __timedOut: true }): result is { __timedOut: true } {
  return '__timedOut' in result;
}

/** Assert a `race()` result is a real ExecutionResult (not the timeout sentinel) and return it. */
function executionResult(result: ExecutionResult | { __timedOut: true }): ExecutionResult {
  if (timedOut(result)) throw new Error('execution timed out before producing a result');
  return result;
}

const TARGET_PROPERTY = 4215213;
const PROPERTIES = Array.from({ length: 50 }, (_, i) => ({ id: 4215200 + i }));

// ---------------------------------------------------------------------------
// THE BUG: local useState + virtualizer recycle ⇒ polter hangs forever
// ---------------------------------------------------------------------------

describe('PRO-184 — virtualized table + InlineEditableCell with LOCAL state', () => {
  it('polter throws with a useful diagnostic; input was missing across the full poll window', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <Harness properties={PROPERTIES} cellMode="local" recycleAfterClick />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // Sample the DOM every 50ms. Records whether the input is present.
    // Proves that the input was absent during the entire window polter was
    // looking — i.e. the "screenshot shows the input" timing has to be a
    // later moment, not the moment polter polled.
    const inputPresenceSamples: boolean[] = [];
    const sampler = setInterval(() => {
      inputPresenceSamples.push(
        !!document.querySelector(`[data-testid="input-${TARGET_PROPERTY}"]`),
      );
    }, 50);

    let result: ExecutionResult | { __timedOut: true };
    try {
      result = await act(async () =>
        // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
        race(ctx!.execute('edit_markup', { property_id: TARGET_PROPERTY }), 12000),
      );
    } finally {
      clearInterval(sampler);
    }

    // Polter now fails cleanly with a diagnostic error (a fix from this PR).
    expect(timedOut(result)).toBe(false);
    expect(executionResult(result).error).toMatch(/Target "acc-markup-input"/);
    expect(executionResult(result).error).toMatch(/edit_markup/);

    // The input was never on screen while polter was looking.
    // biome-ignore lint/complexity/useIndexOf: grandfathered at Biome adoption — fix and remove over time
    const firstPoll = inputPresenceSamples.findIndex((p) => p === true);
    expect(firstPoll).toBe(-1);
  }, 20000);
});

// ---------------------------------------------------------------------------
// THE FIX (point (d)): lift editing state out of the row ⇒ bug goes away
// ---------------------------------------------------------------------------

describe('PRO-184 — same scenario, editing state lifted to shared map', () => {
  it('completes because editing survives row unmount/remount', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <Harness properties={PROPERTIES} cellMode="shared" recycleAfterClick />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    const result = await act(async () =>
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      race(ctx!.execute('edit_markup', { property_id: TARGET_PROPERTY }), 5000),
    );

    expect(timedOut(result)).toBe(false);
    expect(executionResult(result).error).toBeUndefined();
    expect((screen.getByTestId(`input-${TARGET_PROPERTY}`) as HTMLInputElement).value).toBe('25');
  }, 15000);
});

// ---------------------------------------------------------------------------
// Regression guard: docs/best-practices.md promises "polter polls past
// disabled elements and clicks when they become enabled" for slow loads.
// PRO-184's fix introduces a hard ceiling on patience — verify that
// patience past the base timeout still kicks in when the disabled pattern
// is used (i.e. we didn't accidentally regress slow-API ergonomics).
// ---------------------------------------------------------------------------

describe('PRO-184 — disabled-while-loading pattern still works', () => {
  it('extends polling past base timeout while target is rendered disabled, returns once enabled', async () => {
    const slow = defineAction({ name: 'slow_load', description: 'Slow' });
    const setReadyRef: { current: ((v: boolean) => void) | null } = { current: null };

    function App() {
      const [ready, setReady] = useState(false);
      setReadyRef.current = setReady;
      useAgentAction({
        ...slow,
        steps: [{ label: 'click', target: 'go' }],
      });
      return (
        <AgentTarget name="go">
          {/** biome-ignore lint/a11y/useButtonType: grandfathered at Biome adoption — fix and remove over time */}
          <button data-testid="go" disabled={!ready}>
            go
          </button>
        </AgentTarget>
      );
    }

    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <App />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    // Kick off execution; the button is disabled, so polter must keep
    // polling past the 5s base timeout. After ~6.5s we enable it via
    // flushSync so the test environment commits immediately.
    // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
    const exec = act(async () => ctx!.execute('slow_load'));
    setTimeout(() => {
      flushSync(() => setReadyRef.current?.(true));
    }, 6500);
    const result = await exec;

    expect(result.error).toBeUndefined();
    expect(result.trace[0]?.status).toBe('completed');
  }, 15000);
});

// ---------------------------------------------------------------------------
// Control — without the recycle, local state works. Isolates the cause to
// the virtualizer recycling, not polter's target lookup.
// ---------------------------------------------------------------------------

describe('PRO-184 — control: no recycle, local state works fine', () => {
  it('completes when the virtualizer does NOT recycle rows', async () => {
    let ctx: ReturnType<typeof useAgentActions> | null = null;
    render(
      <AgentActionProvider mode="instant">
        <Harness properties={PROPERTIES} cellMode="local" recycleAfterClick={false} />
        <TestConsumer onContext={(c) => (ctx = c)} />
      </AgentActionProvider>,
    );

    const result = await act(async () =>
      // biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
      race(ctx!.execute('edit_markup', { property_id: TARGET_PROPERTY }), 5000),
    );

    expect(timedOut(result)).toBe(false);
    expect(executionResult(result).error).toBeUndefined();
    expect((screen.getByTestId(`input-${TARGET_PROPERTY}`) as HTMLInputElement).value).toBe('25');
  }, 15000);
});
