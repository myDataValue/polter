import { describe, expect, it, vi } from 'vitest';

import {
  resolveStepElement,
  setNativeInputValue,
  simulateFullClick,
  simulateTyping,
} from '../executor/visualExecutor';

// These exercise the polter "DOM script runtime" — the low-level typing/click
// primitives every agent action runs through. A regression here breaks action
// execution in every consuming app silently, so the behaviour is pinned with
// hand-specified event sequences (not the production fn re-invoked).

type StepArg = Parameters<typeof resolveStepElement>[0];
type ConfigArg = Parameters<typeof resolveStepElement>[3];

function makeInput(initial = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.value = initial;
  document.body.appendChild(input);
  return input;
}

describe('setNativeInputValue', () => {
  it('sets the value and fires bubbling input + change events (so React onChange runs)', () => {
    const input = makeInput();
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    setNativeInputValue(input, 'hello');

    expect(input.value).toBe('hello');
    expect(events).toEqual(['input', 'change']);
  });

  it('overwrites an existing value', () => {
    const input = makeInput('old');
    setNativeInputValue(input, 'new');
    expect(input.value).toBe('new');
  });
});

describe('simulateTyping', () => {
  it('types a short value character-by-character then commits with Enter + blur', async () => {
    const input = makeInput();
    const progressive: string[] = [];
    let enterPressed = false;
    let blurred = false;
    input.addEventListener('input', () => progressive.push(input.value));
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') enterPressed = true;
    });
    input.addEventListener('blur', () => {
      blurred = true;
    });

    await simulateTyping(input, 'abc');

    expect(input.value).toBe('abc');
    expect(progressive).toEqual(['a', 'ab', 'abc']); // one input event per char
    expect(enterPressed).toBe(true);
    expect(blurred).toBe(true);
  });

  it('sets a long value (>50 chars) in one shot rather than char-by-char', async () => {
    const input = makeInput();
    let inputEvents = 0;
    input.addEventListener('input', () => {
      inputEvents += 1;
    });
    const long = 'x'.repeat(60);

    await simulateTyping(input, long);

    expect(input.value).toBe(long);
    expect(inputEvents).toBe(1); // single shot, not 60 progressive events
  });

  it('handles an empty value without crashing and still commits', async () => {
    const input = makeInput();
    let enterPressed = false;
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') enterPressed = true;
    });

    await simulateTyping(input, '');

    expect(input.value).toBe('');
    expect(enterPressed).toBe(true);
  });

  it('returns early without typing or committing when the signal is already aborted', async () => {
    const input = makeInput();
    let enterPressed = false;
    input.addEventListener('keydown', () => {
      enterPressed = true;
    });
    const controller = new AbortController();
    controller.abort();

    await simulateTyping(input, 'abc', controller.signal);

    expect(input.value).toBe(''); // nothing typed
    expect(enterPressed).toBe(false); // no Enter commit
  });
});

describe('simulateFullClick', () => {
  it('dispatches the full pointer/mouse sequence in order (so Radix primitives activate)', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const seq: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.addEventListener(type, () => seq.push(type));
    }

    simulateFullClick(el);

    expect(seq).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  });
});

describe('resolveStepElement', () => {
  it('evaluates a function target with params and delegates to config.resolveTarget', async () => {
    const resolved = document.createElement('div');
    const resolveTarget = vi.fn().mockResolvedValue({ element: resolved });
    const step = { target: (p: Record<string, unknown>) => `pms-option:${p.kind}` };

    const result = await resolveStepElement(
      step as unknown as StepArg,
      'connect_pms',
      { kind: 'hostify' },
      { resolveTarget } as unknown as ConfigArg,
    );

    expect(result.element).toBe(resolved);
    expect(resolveTarget).toHaveBeenCalledWith(
      'connect_pms',
      'pms-option:hostify',
      undefined, // signal
      { kind: 'hostify' },
      5000, // default step timeout
      undefined, // skipCheck
      undefined, // intent
      undefined, // optional
    );
  });

  it('skips the scrollTo dispatch when the detail function returns undefined', async () => {
    const seen: CustomEvent[] = [];
    const handler = (e: Event) => seen.push(e as CustomEvent);
    window.addEventListener('mdv-scroll', handler);
    const step = { scrollTo: { dispatchEvent: 'mdv-scroll', detail: () => undefined } };

    await resolveStepElement(step as unknown as StepArg, 'a', {}, {} as unknown as ConfigArg);

    window.removeEventListener('mdv-scroll', handler);
    expect(seen).toHaveLength(0);
  });

  it('dispatches scrollTo with the computed detail when present', async () => {
    const seen: CustomEvent[] = [];
    const handler = (e: Event) => seen.push(e as CustomEvent);
    window.addEventListener('mdv-scroll', handler);
    const step = {
      scrollTo: { dispatchEvent: 'mdv-scroll', detail: (p: Record<string, unknown>) => p.id },
    };

    await resolveStepElement(
      step as unknown as StepArg,
      'a',
      { id: 42 },
      {} as unknown as ConfigArg,
    );

    window.removeEventListener('mdv-scroll', handler);
    expect(seen).toHaveLength(1);
    expect(seen[0].detail).toBe(42);
  });
});
