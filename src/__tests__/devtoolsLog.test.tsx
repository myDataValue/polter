/**
 * The DevTools log is the ONLY surface a browser-driven `execute()` can read a
 * completed action's result from, so it is the execution-layer instrument for
 * any action that resolves a structured outcome. It rendered `error` and
 * `trace` but not `outcome`, which made "did the agent actually receive the
 * right result?" unwritable as an e2e assertion.
 *
 * These are invariants on a DEV-ONLY render surface: nothing here touches the
 * executor, the resolvers, or `ExecutionResult`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentAction } from '../components/AgentAction';
import { AgentActionProvider } from '../components/AgentActionProvider';
import { AgentDevTools } from '../components/AgentDevTools';
import { defineAction } from '../core/helpers';

const action = defineAction({ name: 'log_outcome', description: 'Log outcome' });

// jsdom implements no layout, so the panel's scroll-to-latest effect throws
// without this. Nothing under test depends on scrolling.
Element.prototype.scrollIntoView = () => undefined;

afterEach(cleanup);

/** Render the panel open, with one action whose `waitFor` the caller settles. */
function renderPanel(waitFor?: { current: Promise<unknown> | undefined }) {
  render(
    <AgentActionProvider mode="instant">
      <AgentAction action={action} waitFor={waitFor}>
        {/** biome-ignore lint/a11y/useButtonType: matches the sibling execution tests */}
        <button>Go</button>
      </AgentAction>
      <AgentDevTools defaultOpen />
    </AgentActionProvider>,
  );
}

/**
 * Drive the action from the panel's own Run button — the exact path the e2e
 * `runAgentAction` helper uses — then read its settled log entry. `settle` runs
 * once the execution is in flight so a deferred `waitFor` can be resolved or
 * rejected mid-run.
 */
async function runAndReadLogEntry(settle: () => void): Promise<Element> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  });
  await act(async () => {
    settle();
  });

  fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
  const selector = '[data-agent-action="log_outcome"]';
  await waitFor(() => {
    const el = document.querySelector(selector);
    expect(el?.getAttribute('data-execution-status')).toMatch(/^(succeeded|failed)$/);
  });
  // biome-ignore lint/style/noNonNullAssertion: asserted present above
  return document.querySelector(selector)!;
}

describe('AgentDevTools log entry', () => {
  it('exposes the resolved waitFor value as parseable data-agent-outcome', async () => {
    let resolve!: (value: unknown) => void;
    const ref = {
      current: new Promise<unknown>((r) => {
        resolve = r;
      }),
    };
    renderPanel(ref);

    const entry = await runAndReadLogEntry(() => resolve({ a: 1 }));

    expect(JSON.parse(entry.getAttribute('data-agent-outcome') ?? 'null')).toEqual({ a: 1 });
    expect(entry.getAttribute('data-execution-status')).toBe('succeeded');
  });

  it('renders no outcome attribute when the action resolved none', async () => {
    renderPanel();

    const entry = await runAndReadLogEntry(() => undefined);

    expect(entry.hasAttribute('data-agent-outcome')).toBe(false);
    // Unchanged by this surface: status still reports the execution itself.
    expect(entry.getAttribute('data-execution-status')).toBe('succeeded');
  });

  it('keeps a failed execution readable as failed with no outcome', async () => {
    let reject!: (reason: unknown) => void;
    const promise = new Promise<unknown>((_r, rej) => {
      reject = rej;
    });
    // Detached catch: mirrors createSettlableDoneRef, so a human-triggered
    // rejection is not an unhandled rejection. It must not hide the failure.
    promise.catch(() => undefined);
    renderPanel({ current: promise });

    const entry = await runAndReadLogEntry(() => reject(new Error('Stream closed')));

    expect(entry.getAttribute('data-execution-status')).toBe('failed');
    expect(entry.hasAttribute('data-agent-outcome')).toBe(false);
    expect(entry.querySelector('[data-agent-error]')?.textContent).toContain('Stream closed');
  });
});
