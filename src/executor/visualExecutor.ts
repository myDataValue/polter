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
  // waitForMount steps use mountTimeout; normal steps use the default 3s.
  const timeout = target.waitForMount ? (config.mountTimeout ?? 5000) : undefined;

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

async function executeInstant(
  action: RegisteredAction,
  params: Record<string, unknown>,
): Promise<ExecutionResult> {
  const executionStart = performance.now();
  const stepTraces: StepTrace[] = [];

  try {
    const targets = action.getExecutionTargets();
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const stepStart = performance.now();

      if (target.skipIf?.(params)) {
        stepTraces.push({
          index: i,
          label: target.label,
          status: 'skipped',
          targetFound: !!target.element,
          interactionType: 'none',
          durationMs: performance.now() - stepStart,
        });
        continue;
      }

      target.element?.click();
      stepTraces.push({
        index: i,
        label: target.label,
        status: 'completed',
        targetType: 'static',
        targetFound: !!target.element,
        interactionType: 'click',
        durationMs: performance.now() - stepStart,
      });
    }
    if (action.waitFor) {
      await action.waitFor();
    }
    return { success: true, actionName: action.name, trace: stepTraces, durationMs: performance.now() - executionStart };
  } catch (err) {
    return { success: false, actionName: action.name, error: String(err), trace: stepTraces, durationMs: performance.now() - executionStart };
  }
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

async function executeGuided(
  action: RegisteredAction,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const executionStart = performance.now();
  const targets = action.getExecutionTargets();
  const stepTraces: StepTrace[] = [];

  // No targets and no awaitResult — nothing to do
  if (targets.length === 0 || targets.every((t) => t.element && !isElementVisible(t.element))) {
    if (action.waitFor) {
      await action.waitFor();
    }
    return { success: true, actionName: action.name, trace: [], durationMs: performance.now() - executionStart };
  }

  let spotlight: SpotlightHandle | null = null;
  let cursor: OverlayHandle | null = null;
  const blocker = createBlockingOverlay();

  if (config.cursorEnabled) {
    cursor = createCursor();
  }

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
      const element = await resolveStepElement(target, action.name, params, config);
      if (!isElementVisible(element)) {
        if (targets.length > 1) {
          blocker.remove();
          cursor?.remove();
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

      // 1. Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(300, config.signal);

      // 2. Move cursor to element
      if (cursor) {
        await moveCursorTo(element, config.signal);
      }

      // 3. Spotlight
      spotlight = createSpotlight(element, target.label, config);
      await delay(config.stepDelay, config.signal);

      // 4. Interact based on step type
      let interactionType: StepTrace['interactionType'] = 'click';
      if (target.setParam) {
        interactionType = 'type';
        // Type the param value into the input — find the actual input/textarea within the element
        const inputEl = (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
          ? element
          : element.querySelector('input, textarea') ?? element;
        const value = String(params[target.setParam] ?? target.defaultValue ?? '');
        await simulateTyping(inputEl as HTMLElement, value, config.signal);
      } else if (target.setValue && target.onSetValue) {
        interactionType = 'setValue';
        // Set value programmatically via callback
        const value = params[target.setValue] ?? target.defaultValue;
        target.onSetValue(value);
      } else {
        // Click every step — pure ADUI
        animateCursorClick();
        element.click();
      }

      // 5. Remove spotlight
      spotlight.remove();
      spotlight = null;

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

      if (!isLast) {
        await delay(200, config.signal);
      }
    }

    // 6. Await async work triggered by step clicks
    if (action.waitFor) {
      await action.waitFor();
    }

    blocker.remove();
    cursor?.remove();
    return { success: true, actionName: action.name, trace: stepTraces, durationMs: performance.now() - executionStart };
  } catch (err) {
    // Clean up on error
    spotlight?.remove();
    blocker.remove();
    cursor?.remove();

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

export async function executeAction(
  action: RegisteredAction,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  if (config.mode === 'instant') {
    return executeInstant(action, params);
  }
  return executeGuided(action, params, config);
}
