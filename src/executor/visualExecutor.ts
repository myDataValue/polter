import type { RegisteredAction, ExecutionResult, ExecutionTarget, ExecutorConfig, StepTrace } from '../core/types';

let stylesInjected = false;

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
  `;
  document.head.appendChild(style);
}

interface OverlayHandle {
  remove: () => void;
}

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .68-.61.3-.92L5.95 2.87a.5.5 0 0 0-.45.34z" fill="#1e293b" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

/**
 * Full-screen overlay that blocks user interaction during guided execution.
 * Persists across steps so there's no gap where clicks can leak through.
 */
function createBlockingOverlay(): OverlayHandle {
  const overlay = document.createElement('div');
  overlay.className = 'polter-blocking-overlay';
  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99997;
    cursor:not-allowed;
  `;
  document.body.appendChild(overlay);
  return { remove: () => overlay.remove() };
}

function createCursor(): OverlayHandle {
  injectStyles();

  const cursor = document.createElement('div');
  cursor.className = 'polter-cursor';
  cursor.innerHTML = CURSOR_SVG;
  cursor.style.cssText = `
    position:fixed;
    left:-40px;
    top:-40px;
    z-index:100000;
    pointer-events:none;
    transition:left 0.4s cubic-bezier(0.4,0,0.2,1),top 0.4s cubic-bezier(0.4,0,0.2,1);
    filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  `;
  document.body.appendChild(cursor);

  return { remove: () => cursor.remove() };
}

function moveCursorTo(target: HTMLElement, signal?: AbortSignal): Promise<void> {
  const cursor = document.querySelector('.polter-cursor') as HTMLElement | null;
  if (!cursor) return Promise.resolve();

  const rect = target.getBoundingClientRect();
  cursor.style.left = `${rect.left + rect.width / 2}px`;
  cursor.style.top = `${rect.top + rect.height / 2}px`;

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
  target: HTMLElement,
  label: string,
  config: ExecutorConfig,
): SpotlightHandle {
  injectStyles();

  const rect = target.getBoundingClientRect();
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
    border:2px solid #3b82f6;
    border-radius:10px;
    z-index:99999;
    pointer-events:none;
    animation:polter-pulse 1.5s ease-in-out infinite;
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
function setNativeInputValue(input: HTMLInputElement, value: string): void {
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
async function simulateTyping(element: HTMLElement, value: string, signal?: AbortSignal): Promise<void> {
  const input = element as HTMLInputElement;
  input.focus();

  // Clear existing value first
  if (input.value) {
    setNativeInputValue(input, '');
    await delay(30, signal);
  }

  // Type each character with a small delay
  const charDelay = Math.max(15, Math.min(40, 800 / value.length));
  for (let i = 0; i < value.length; i++) {
    if (signal?.aborted) return;
    setNativeInputValue(input, value.slice(0, i + 1));
    await delay(charDelay, signal);
  }

  // Blur after typing to commit the value — triggers onBlur save handlers.
  // The delay lets React process the blur event and flush synchronous state
  // updates before the next step or action starts interacting with the DOM.
  input.blur();
  await delay(100, signal);
}

/**
 * Resolve the element for a step. For static steps, returns the element directly.
 * For fromParam steps, polls the AgentTarget registry until a match is found.
 */
async function resolveStepElement(
  target: ExecutionTarget,
  actionName: string,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<HTMLElement | null> {
  const timeout = 5000;

  // scrollTo runs first (e.g. scroll virtualized list into view)
  if (target.scrollTo) {
    await target.scrollTo(params);
    await delay(200, config.signal);
  }

  // fromParam: resolve lazily from AgentTarget registry by param value.
  // For array params, resolve against the first element (spotlight one representative target).
  if (target.fromParam && config.resolveTarget) {
    const paramKey = typeof target.fromParam === 'function' ? target.fromParam(params) : target.fromParam;
    const raw = params[paramKey];
    const first = Array.isArray(raw) ? raw[0] : raw;
    const paramValue = String(first ?? target.defaultValue ?? '');
    return config.resolveTarget(actionName, paramKey, paramValue, config.signal, timeout);
  }

  // fromTarget: resolve lazily from AgentTarget registry by name
  if (target.fromTarget && config.resolveNamedTarget) {
    const targetName = typeof target.fromTarget === 'function' ? target.fromTarget(params) : target.fromTarget;
    return config.resolveNamedTarget(actionName, targetName, config.signal, params, timeout);
  }

  // Static element
  return target.element;
}

/**
 * Check whether an element is present, visible, and measurable.
 * Returns false for null, detached nodes, and display:contents wrappers
 * (whose getBoundingClientRect() returns all zeros).
 */
function isElementVisible(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// ---------------------------------------------------------------------------
// Step effects — encapsulate all mode-specific visual behavior so the
// execution loop stays mode-agnostic.
// ---------------------------------------------------------------------------

interface StepEffects {
  before(element: HTMLElement, label: string): Promise<void>;
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
function simulateFullClick(element: HTMLElement): void {
  const opts: PointerEventInit = { bubbles: true, cancelable: true, composed: true };
  element.dispatchEvent(new PointerEvent('pointerdown', opts));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new PointerEvent('pointerup', opts));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.click();
}

function createGuidedEffects(config: ExecutorConfig): StepEffects {
  const blocker = createBlockingOverlay();
  const cursor = config.cursorEnabled ? createCursor() : null;
  let spotlight: SpotlightHandle | null = null;

  return {
    async before(element, label) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(300, config.signal);
      if (cursor) await moveCursorTo(element, config.signal);
      spotlight = createSpotlight(element, label, config);
      await delay(config.stepDelay, config.signal);
    },
    async after(isLast) {
      spotlight?.remove();
      spotlight = null;
      if (!isLast) await delay(200, config.signal);
    },
    async type(input, value) {
      await simulateTyping(input, value, config.signal);
    },
    click(element) {
      animateCursorClick();
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
    async before() { },
    async after() { },
    async type(input, value) {
      setNativeInputValue(input as HTMLInputElement, value);
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
  const targets = action.getExecutionTargets();
  const stepTraces: StepTrace[] = [];

  // No targets and no awaitResult — nothing to do.
  // Visibility check only in guided mode — instant mode doesn't need measurable elements.
  if (targets.length === 0 || (config.mode === 'guided' && targets.every((t) => t.element && !isElementVisible(t.element)))) {
    if (action.waitFor) {
      await action.waitFor();
    }
    return { success: true, actionName: action.name, trace: [], durationMs: performance.now() - executionStart };
  }

  const fx = config.mode === 'instant'
    ? createInstantEffects()
    : createGuidedEffects(config);

  // Track in-progress step for the catch block
  let activeStep: { index: number; target: ExecutionTarget; start: number } | null = null;

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const isLast = i === targets.length - 1;
      const stepStart = performance.now();

      // Skip when the step declares a precondition is already satisfied.
      if (target.skipIf?.(params)) {
        stepTraces.push({
          index: i,
          label: target.label,
          status: 'skipped',
          targetFound: false,
          interactionType: 'none',
          durationMs: performance.now() - stepStart,
        });
        continue;
      }

      activeStep = { index: i, target, start: stepStart };

      const resolvedFromParam = typeof target.fromParam === 'function' ? target.fromParam(params) : target.fromParam;
      const resolvedFromTarget = typeof target.fromTarget === 'function' ? target.fromTarget(params) : target.fromTarget;
      const targetType = resolvedFromParam ? 'fromParam' as const : resolvedFromTarget ? 'fromTarget' as const : 'static' as const;
      const targetName = resolvedFromParam || resolvedFromTarget;
      const targetValue = resolvedFromParam
        ? String(params[resolvedFromParam] ?? target.defaultValue ?? '')
        : resolvedFromTarget || undefined;

      // Resolve element (may be lazy for fromParam steps).
      // Multi-step actions abort on miss; single-step actions continue silently.
      // Instant mode only needs the element to exist; guided mode needs it measurable (for spotlight).
      const resolved = await resolveStepElement(target, action.name, params, config);
      const element = config.mode === 'instant'
        ? (resolved?.isConnected ? resolved : null)
        : (isElementVisible(resolved) ? resolved : null);
      if (!element) {
        if (targets.length > 1) {
          fx.cleanup();
          const reason = !element ? `target not found for step "${target.label}"` : `element not visible: "${target.label}"`;
          stepTraces.push({
            index: i,
            label: target.label,
            status: 'failed',
            targetType,
            targetName,
            targetValue,
            targetFound: !!element,
            interactionType: 'none',
            error: reason,
            durationMs: performance.now() - stepStart,
          });
          return { success: false, actionName: action.name, error: reason, trace: stepTraces, durationMs: performance.now() - executionStart };
        }
        stepTraces.push({
          index: i,
          label: target.label,
          status: 'skipped',
          targetType,
          targetName,
          targetValue,
          targetFound: false,
          interactionType: 'none',
          durationMs: performance.now() - stepStart,
        });
        continue;
      }

      await fx.before(element, target.label);

      // Interact based on step type
      let interactionType: StepTrace['interactionType'] = 'click';
      if (target.setParam) {
        interactionType = 'type';
        const inputEl = (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
          ? element
          : element.querySelector('input, textarea') ?? element;
        const value = String(params[target.setParam] ?? target.defaultValue ?? '');
        await fx.type(inputEl as HTMLElement, value);
      } else if (target.setValue && target.onSetValue) {
        interactionType = 'setValue';
        const value = params[target.setValue] ?? target.defaultValue;
        target.onSetValue(value);
      } else {
        fx.click(element);
      }

      await fx.after(isLast);

      stepTraces.push({
        index: i,
        label: target.label,
        status: 'completed',
        targetType,
        targetName,
        targetValue,
        targetFound: true,
        interactionType,
        durationMs: performance.now() - stepStart,
      });

      activeStep = null;
    }

    // Remove overlay before awaiting async work — steps are done,
    // user should be able to interact while waitFor runs.
    fx.cleanup();

    // Await async work triggered by step clicks
    if (action.waitFor) {
      await action.waitFor();
    }

    return { success: true, actionName: action.name, trace: stepTraces, durationMs: performance.now() - executionStart };
  } catch (err) {
    fx.cleanup();

    const errorMsg = err instanceof DOMException && err.name === 'AbortError'
      ? 'Execution cancelled'
      : String(err);

    // Trace the step that was in progress when the error occurred
    if (activeStep) {
      const { index, target: t, start } = activeStep;
      const fp = typeof t.fromParam === 'function' ? t.fromParam(params) : t.fromParam;
      const ft = typeof t.fromTarget === 'function' ? t.fromTarget(params) : t.fromTarget;
      stepTraces.push({
        index,
        label: t.label,
        status: 'failed',
        targetType: fp ? 'fromParam' : ft ? 'fromTarget' : 'static',
        targetName: fp || ft,
        targetFound: false,
        interactionType: 'none',
        error: errorMsg,
        durationMs: performance.now() - start,
      });
    }

    return { success: false, actionName: action.name, error: errorMsg, trace: stepTraces, durationMs: performance.now() - executionStart };
  }
}
