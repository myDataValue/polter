import type { RegisteredAction, ExecutionResult, StepDefinition, ExecutorConfig, StepTrace, ResolveDiagnostics } from '../core/types';
import { createDebugLogger } from '../core/debugLog';

let stylesInjected = false;
// The cursor persists its position across actions so it glides from where it
// last stopped instead of snapping back to the off-screen origin each step.
let lastCursorPos: { x: number; y: number } | null = null;
let cursorRemovalTimer: ReturnType<typeof setTimeout> | null = null;

function injectStyles(): void {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'polter-styles';
  style.textContent = `
    @keyframes polter-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.02); }
    }
    @keyframes polter-fade-in {
      from { opacity: 0; transform: translateX(-50%) translateY(4px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes polter-cursor-click {
      0% { transform: scale(1); }
      50% { transform: scale(0.85); }
      100% { transform: scale(1); }
    }
    .polter-cursor svg {
      display:block;
      filter:drop-shadow(0 2px 5px rgba(15,23,42,0.3));
    }
    .polter-cursor-label {
      position:absolute;
      left:19px;
      top:18px;
      display:inline-flex;
      align-items:center;
      gap:6px;
      height:24px;
      padding:0 10px;
      border:1px solid rgba(255,255,255,0.14);
      border-radius:999px;
      background:#171717;
      color:#ffffff;
      box-shadow:0 8px 20px rgba(15,23,42,0.24);
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:12px;
      font-weight:700;
      letter-spacing:0;
      line-height:1;
      white-space:nowrap;
    }
    .polter-cursor-label::before {
      content:"";
      width:7px;
      height:7px;
      border-radius:999px;
      background:#51b13e;
      box-shadow:0 0 0 3px rgba(81,177,62,0.18);
    }
  `;
  document.head.appendChild(style);
}

interface OverlayHandle {
  remove: () => void;
}

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M6.18 3.54v20.2c0 .55.68.81 1.05.41l5.33-5.73a.7.7 0 0 1 .51-.22h8.13c.6 0 .85-.77.36-1.12L7.1 3.08a.58.58 0 0 0-.92.46z" fill="#51B13E" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="m13.18 18.42 2.53 5.62c.17.38.62.55 1 .38l2.18-.98c.38-.17.55-.62.38-1l-2.12-4.72" fill="#171717" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

const CURSOR_LABEL = 'myData AI';

/**
 * Full-screen overlay during guided execution. pointer-events:none so the
 * page (including chat stop button and modals) stays interactive — polter
 * dispatches clicks programmatically via simulateFullClick, so it doesn't
 * need to block user interaction.
 */
function createBlockingOverlay(): OverlayHandle {
  const overlay = document.createElement('div');
  overlay.className = 'polter-blocking-overlay';
  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99997;
    pointer-events:none;
  `;
  document.body.appendChild(overlay);
  return { remove: () => overlay.remove() };
}

function cancelPendingCursorRemoval(): void {
  if (cursorRemovalTimer !== null) {
    clearTimeout(cursorRemovalTimer);
    cursorRemovalTimer = null;
  }
}

/**
 * Defer cursor removal so back-to-back actions reuse the same element and the
 * cursor glides between targets; the next action cancels the pending removal.
 * Only a genuinely idle agent (no follow-up step) lets the timer fire.
 */
function scheduleCursorRemoval(): void {
  cancelPendingCursorRemoval();
  cursorRemovalTimer = setTimeout(() => {
    cursorRemovalTimer = null;
    document.querySelector('.polter-cursor')?.remove();
  }, 800);
}

function getOrCreateCursor(): OverlayHandle {
  injectStyles();
  cancelPendingCursorRemoval();

  // Reuse a still-present cursor so it continues from its current position
  // rather than re-entering from the corner each action.
  const existing = document.querySelector('.polter-cursor') as HTMLElement | null;
  if (existing) {
    return { remove: scheduleCursorRemoval };
  }

  const cursor = document.createElement('div');
  cursor.className = 'polter-cursor';
  cursor.innerHTML = `${CURSOR_SVG}<div class="polter-cursor-label">${CURSOR_LABEL}</div>`;
  // Start where the cursor last stopped. The first-ever appearance has no
  // recorded position, so it glides in from the off-screen top-left corner —
  // that initial entrance is intentional; only subsequent resets were the bug.
  const start = lastCursorPos ?? { x: -40, y: -40 };
  cursor.style.cssText = `
    position:fixed;
    left:${start.x}px;
    top:${start.y}px;
    z-index:100000;
    pointer-events:none;
    transition:left 0.4s cubic-bezier(0.4,0,0.2,1),top 0.4s cubic-bezier(0.4,0,0.2,1);
  `;
  document.body.appendChild(cursor);

  return { remove: scheduleCursorRemoval };
}

// A connected-but-unlaid-out target reports an all-zero box: width/height 0 at (0,0).
// Happens when the target is in a tab that isn't open, hidden at a responsive
// breakpoint, or measured mid-re-render. Its "centre" is (0,0), so moving the cursor
// or spotlight there snaps them to the top-left corner — the classic "stuck cursor".
export function isDegenerateRect(rect: Pick<DOMRect, 'width' | 'height'>): boolean {
  return rect.width === 0 && rect.height === 0;
}

function moveCursorTo(rect: DOMRect, signal?: AbortSignal): Promise<void> {
  const cursor = document.querySelector('.polter-cursor') as HTMLElement | null;
  if (!cursor) return Promise.resolve();
  // Don't fly the cursor to (0,0) for an off-layout target — leave it where it was.
  if (isDegenerateRect(rect)) return Promise.resolve();

  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  lastCursorPos = { x, y };

  return delay(450, signal);
}

function animateCursorClick(): void {
  const cursor = document.querySelector('.polter-cursor') as HTMLElement | null;
  if (!cursor) return;
  cursor.style.animation = 'polter-cursor-click 0.2s ease';
  cursor.addEventListener('animationend', () => { cursor.style.animation = ''; }, { once: true });
}

interface SpotlightHandle {
  remove: () => void;
}

function createSpotlight(
  rect: DOMRect,
  label: string,
  config: ExecutorConfig,
): SpotlightHandle {
  injectStyles();

  const padding = config.spotlightPadding;
  const overlayRgba = `rgba(0, 0, 0, ${config.overlayOpacity})`;

  const container = document.createElement('div');
  container.className = 'polter-spotlight-container';
  container.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;';

  // Box-shadow creates the dimmed overlay with a hole for the target
  const spotlight = document.createElement('div');
  spotlight.className = 'polter-spotlight';
  spotlight.style.cssText = `
    position:fixed;
    left:${rect.left - padding}px;
    top:${rect.top - padding}px;
    width:${rect.width + padding * 2}px;
    height:${rect.height + padding * 2}px;
    border-radius:8px;
    box-shadow:0 0 0 9999px ${overlayRgba};
    z-index:99998;
    pointer-events:none;
    transition:all 0.3s ease;
  `;

  // Pulsing ring around the target
  const ring = document.createElement('div');
  ring.className = 'polter-ring';
  ring.style.cssText = `
    position:fixed;
    left:${rect.left - padding - 2}px;
    top:${rect.top - padding - 2}px;
    width:${rect.width + padding * 2 + 4}px;
    height:${rect.height + padding * 2 + 4}px;
    border:2px solid #51b13e;
    border-radius:10px;
    z-index:99999;
    pointer-events:none;
    animation:polter-pulse 1.5s ease-in-out infinite;
    box-shadow:0 0 0 4px rgba(81,177,62,0.12);
  `;

  container.appendChild(spotlight);
  container.appendChild(ring);

  // Tooltip
  if (label && config.tooltipEnabled) {
    const tooltip = document.createElement('div');
    tooltip.className = 'polter-tooltip';
    tooltip.textContent = label;

    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const isBelow = spaceBelow > 60;
    const tooltipTop = isBelow
      ? rect.bottom + padding + 12
      : rect.top - padding - 44;

    tooltip.style.cssText = `
      position:fixed;
      left:${rect.left + rect.width / 2}px;
      top:${tooltipTop}px;
      transform:translateX(-50%);
      background:#1e293b;
      color:#f8fafc;
      padding:8px 14px;
      border-radius:6px;
      font-size:13px;
      font-weight:500;
      line-height:1.4;
      white-space:nowrap;
      z-index:99999;
      pointer-events:none;
      animation:polter-fade-in 0.2s ease;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
    `;

    container.appendChild(tooltip);
  }

  document.body.appendChild(container);

  return {
    remove: () => container.remove(),
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Set an input's value in a way that triggers React's onChange.
 */
export function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Simulate typing into an input character by character.
 */
export async function simulateTyping(element: HTMLElement, value: string, signal?: AbortSignal): Promise<void> {
  const input = element as HTMLInputElement;
  input.focus();

  // Clear existing value first
  if (input.value) {
    setNativeInputValue(input, '');
    await delay(30, signal);
  }

  // For long values (bulk IDs, etc.) skip the character-by-character animation
  // and set the value in one shot — typing 1000+ chars at 15ms each is ~16s of
  // dead time with no UX benefit.
  if (value.length > 50) {
    setNativeInputValue(input, value);
    await delay(30, signal);
  } else {
    // Type each character with a small delay
    const charDelay = Math.max(15, Math.min(40, 800 / value.length));
    for (let i = 0; i < value.length; i++) {
      if (signal?.aborted) return;
      setNativeInputValue(input, value.slice(0, i + 1));
      await delay(charDelay, signal);
    }
  }

  // Commit the value: dispatch Enter keydown (triggers onKeyDown save
  // handlers), then blur. Enter is more reliable than blur alone because
  // browsers defer blur/focus events when the tab is hidden.
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  input.blur();
  await delay(100, signal);
}

/**
 * Resolve the element for a step by polling the AgentTarget registry.
 */
export async function resolveStepElement(
  step: StepDefinition,
  actionName: string,
  params: Record<string, unknown>,
  config: ExecutorConfig,
  skipCheck?: () => boolean,
): Promise<{ element: HTMLElement | null; diagnostics?: ResolveDiagnostics }> {
  if (step.scrollTo) {
    const hasDetailFn = step.scrollTo.detail !== undefined;
    const detail = step.scrollTo.detail?.(params);
    // Skip dispatch when the detail function returns undefined — matches the
    // pre-refactor "if (id) dispatch" guard pattern. If no detail function was
    // provided at all, fire the event with no payload.
    if (!hasDetailFn || detail !== undefined) {
      window.dispatchEvent(new CustomEvent(step.scrollTo.dispatchEvent, { detail }));
      await delay(200, config.signal);
    }
  }

  const intent =
    typeof step.intent === 'function' ? step.intent(params) : step.intent;

  if ((step.target || intent) && config.resolveTarget) {
    const name =
      typeof step.target === 'function' ? step.target(params) : (step.target ?? '');
    return config.resolveTarget(
      actionName,
      name,
      config.signal,
      params,
      step.timeout ?? 5000,
      skipCheck,
      intent,
    );
  }

  return { element: null };
}

function awaitWaitFor(action: RegisteredAction, signal?: AbortSignal): Promise<unknown> {
  if (!action.waitFor) return Promise.resolve(undefined);
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  const waitPromise = Promise.resolve(action.waitFor());
  if (!signal) return waitPromise;

  return new Promise<unknown>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    waitPromise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

// ---------------------------------------------------------------------------
// Step effects — encapsulate all mode-specific visual behavior so the
// execution loop stays mode-agnostic.
// ---------------------------------------------------------------------------

interface StepEffects {
  before(element: HTMLElement, label: string, refreshElement?: () => Promise<HTMLElement>): Promise<HTMLElement>;
  after(isLast: boolean): Promise<void>;
  type(input: HTMLElement, value: string): Promise<void>;
  click(element: HTMLElement): void;
  cleanup(): void;
}

/**
 * Dispatch the full pointer/mouse event sequence so that Radix primitives
 * (Tabs, Select, DropdownMenu, etc.) respond. Plain `element.click()` only
 * fires a `click` event, but Radix activates on `pointerdown`.
 */
export function simulateFullClick(element: HTMLElement): void {
  const opts: PointerEventInit = { bubbles: true, cancelable: true, composed: true };
  element.dispatchEvent(new PointerEvent('pointerdown', opts));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new PointerEvent('pointerup', opts));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.click();
}

function createGuidedEffects(config: ExecutorConfig): StepEffects {
  const blocker = createBlockingOverlay();
  const cursor = config.cursorEnabled ? getOrCreateCursor() : null;
  let spotlight: SpotlightHandle | null = null;

  return {
    async before(element, label, refreshElement?) {
      // Tab backgrounded — skip all visuals, browser throttles setTimeout to 1s+
      if (document.hidden) return element;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(300, config.signal);
      // scrollIntoView can trigger virtualizer re-renders that recycle the DOM
      // node. Re-resolve before positioning visual indicators.
      if (!element.isConnected && refreshElement) {
        element = await refreshElement();
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        await delay(50, config.signal);
      }
      // Snapshot the rect once — moveCursorTo waits 450ms for its animation,
      // during which the virtualizer could recycle the element again. Using a
      // captured rect avoids stale-element reads in createSpotlight.
      const rect = element.getBoundingClientRect();
      // Off-layout target (hidden tab, narrow-screen breakpoint, mid re-render):
      // skip the visual move + spotlight so they don't snap to the top-left corner.
      // The action itself still runs — only the misleading cursor jump is suppressed.
      const offLayout = isDegenerateRect(rect);
      if (cursor && !offLayout) await moveCursorTo(rect, config.signal);
      if (!offLayout) spotlight = createSpotlight(rect, label, config);
      await delay(config.stepDelay, config.signal);
      return element;
    },
    async after(isLast) {
      spotlight?.remove();
      spotlight = null;
      if (document.hidden) return;
      if (!isLast) await delay(200, config.signal);
    },
    async type(input, value) {
      if (document.hidden) {
        setNativeInputValue(input as HTMLInputElement, value);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        (input as HTMLInputElement).blur();
        await delay(100, config.signal);
        return;
      }
      await simulateTyping(input, value, config.signal);
    },
    click(element) {
      if (!document.hidden) animateCursorClick();
      simulateFullClick(element);
    },
    cleanup() {
      spotlight?.remove();
      blocker.remove();
      cursor?.remove();
    },
  };
}

function createInstantEffects(): StepEffects {
  return {
    async before(element) { return element; },
    async after() { },
    async type(input, value) {
      setNativeInputValue(input as HTMLInputElement, value);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      (input as HTMLInputElement).blur();
      await delay(100);
    },
    click(element) {
      simulateFullClick(element);
    },
    cleanup() { },
  };
}

// ---------------------------------------------------------------------------

export async function executeAction(
  action: RegisteredAction,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const executionStart = performance.now();
  const targets = action.resolveSteps();
  const stepTraces: StepTrace[] = [];
  const log = createDebugLogger(config.debug ?? false);
  log('execute:start', { action: action.name, mode: config.mode, steps: targets.length, params });

  if (targets.length === 0) {
    let outcome: unknown;
    if (action.waitFor) {
      log('waitFor:start', { action: action.name });
      outcome = await awaitWaitFor(action, config.signal);
      log('waitFor:done', { action: action.name });
    }
    log('execute:complete', { action: action.name, durationMs: performance.now() - executionStart });
    return { actionName: action.name, trace: [], durationMs: performance.now() - executionStart, outcome };
  }

  const fx = config.mode === 'instant'
    ? createInstantEffects()
    : createGuidedEffects(config);

  // Track in-progress step for the catch block
  let activeStep: { index: number; step: StepDefinition; start: number } | null = null;

  try {
    for (let i = 0; i < targets.length; i++) {
      const step = targets[i];
      const isLast = i === targets.length - 1;
      const stepStart = performance.now();

      // Skip when the step declares a precondition is already satisfied.
      if (step.skipIf?.(params)) {
        stepTraces.push({
          index: i,
          label: step.label,
          status: 'skipped',
          targetFound: false,
          interactionType: 'none',
          durationMs: performance.now() - stepStart,
        });
        continue;
      }

      activeStep = { index: i, step, start: stepStart };

      const resolvedTarget = typeof step.target === 'function' ? step.target(params) : step.target;
      const targetType: StepTrace['targetType'] = typeof step.target === 'function' ? 'dynamic' : 'static';
      const targetName = resolvedTarget;

      const skipCheck = step.skipIf ? () => step.skipIf!(params) : undefined;
      let element: HTMLElement | null;
      let resolveDiag: ResolveDiagnostics | undefined;
      try {
        const resolved = await resolveStepElement(step, action.name, params, config, skipCheck);
        element = resolved.element;
        resolveDiag = resolved.diagnostics;
      } catch (err) {
        // A prior step may have triggered a state change that makes this step
        // unnecessary (e.g. clicking "Opt In" updates pendingOptimizations,
        // so the second preferredTransitionStep should skip). Re-evaluate
        // skipIf — if it now passes, skip gracefully instead of failing.
        if (step.skipIf?.(params)) {
          stepTraces.push({
            index: i,
            label: step.label,
            status: 'skipped',
            targetFound: false,
            interactionType: 'none',
            durationMs: performance.now() - stepStart,
          });
          continue;
        }
        throw err;
      }
      if (!element) {
        // Re-check skipIf — state may have caught up during polling.
        if (step.skipIf?.(params)) {
          stepTraces.push({
            index: i,
            label: step.label,
            status: 'skipped',
            targetFound: false,
            interactionType: 'none',
            durationMs: performance.now() - stepStart,
          });
          continue;
        }
        if (targets.length > 1) {
          fx.cleanup();
          const reason = targetName
            ? `Target "${targetName}" for action "${action.name}" not found for step "${step.label}"`
            : `target not found for step "${step.label}"`;
          log('step:fail', { index: i, label: step.label, targetName, error: reason, ...resolveDiag });
          stepTraces.push({
            index: i,
            label: step.label,
            status: 'failed',
            targetType,
            targetName,
            targetFound: !!element,
            interactionType: 'none',
            error: reason,
            resolve: resolveDiag,
            durationMs: performance.now() - stepStart,
          });
          log('execute:complete', { action: action.name, error: reason, durationMs: performance.now() - executionStart });
          return { actionName: action.name, error: reason, trace: stepTraces, durationMs: performance.now() - executionStart };
        }
        stepTraces.push({
          index: i,
          label: step.label,
          status: 'skipped',
          targetType,
          targetName,
          targetFound: false,
          interactionType: 'none',
          resolve: resolveDiag,
          durationMs: performance.now() - stepStart,
        });
        continue;
      }
      const ensureConnected = async (): Promise<HTMLElement> => {
        if (element!.isConnected) return element!;
        if (!config.resolveTarget || !targetName) throw new Error(`Target "${targetName}" is no longer in the DOM.`);
        const { element: fresh } = await config.resolveTarget(action.name, targetName, config.signal, params, 3000);
        if (!fresh?.isConnected) throw new Error(
          `Target "${targetName}" was found, then left the DOM before it could be used, and could ` +
          `not be re-resolved within 3s. This is a UI timing/config issue — NOT a login or extension ` +
          `problem. Common causes: the action's steps are registered in both defineAction and ` +
          `useAgentAction (double-click — look for a "[polter] ... steps in both" error); an earlier ` +
          `step's side effect swapped the render branch out; or a virtualized list recycled the row.`,
        );
        return fresh;
      };

      element = await ensureConnected();
      element = await fx.before(element, step.label, ensureConnected);
      element = await ensureConnected();

      // Interact based on step type
      let interactionType: StepTrace['interactionType'] = 'click';
      const resolvedValue = step.value !== undefined
        ? (typeof step.value === 'function' ? step.value(params) : step.value)
        : undefined;

      if (resolvedValue !== undefined) {
        interactionType = 'type';
        const inputEl = (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
          ? element
          : element.querySelector('input, textarea') ?? element;
        await fx.type(inputEl as HTMLElement, resolvedValue);
      } else {
        fx.click(element);
      }

      await fx.after(isLast);

      stepTraces.push({
        index: i,
        label: step.label,
        status: 'completed',
        targetType,
        targetName,
        targetFound: true,
        interactionType,
        resolve: resolveDiag,
        durationMs: performance.now() - stepStart,
      });
      log('step:done', { index: i, label: step.label, interactionType, durationMs: performance.now() - stepStart });

      activeStep = null;
    }

    // Remove overlay before awaiting async work — steps are done,
    // user should be able to interact while waitFor runs.
    fx.cleanup();

    // Await async work triggered by step clicks
    let outcome: unknown;
    if (action.waitFor) {
      log('waitFor:start', { action: action.name });
      outcome = await awaitWaitFor(action, config.signal);
      log('waitFor:done', { action: action.name });
    }

    log('execute:complete', { action: action.name, steps: stepTraces.length, durationMs: performance.now() - executionStart });
    return { actionName: action.name, trace: stepTraces, durationMs: performance.now() - executionStart, outcome };
  } catch (err) {
    fx.cleanup();

    const errorMsg = err instanceof DOMException && err.name === 'AbortError'
      ? 'Execution cancelled'
      : String(err);
    log('execute:error', { action: action.name, error: errorMsg, durationMs: performance.now() - executionStart });

    // Trace the step that was in progress when the error occurred
    if (activeStep) {
      const { index, step: s, start } = activeStep;
      const resolved = typeof s.target === 'function' ? s.target(params) : s.target;
      stepTraces.push({
        index,
        label: s.label,
        status: 'failed',
        targetType: typeof s.target === 'function' ? 'dynamic' : 'static',
        targetName: resolved,
        targetFound: false,
        interactionType: 'none',
        error: errorMsg,
        durationMs: performance.now() - start,
      });
    }

    return { actionName: action.name, error: errorMsg, trace: stepTraces, durationMs: performance.now() - executionStart };
  }
}
