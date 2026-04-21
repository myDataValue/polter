import type { RegisteredAction, ExecutionResult, ExecutionTarget, ExecutorConfig } from '../core/types';

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
  // prepareView runs first (e.g. scroll virtualized list into view)
  if (target.prepareView) {
    await target.prepareView(params);
    await delay(200, config.signal);
  }

  // fromParam: resolve lazily from AgentTarget registry by param value.
  // For array params, resolve against the first element (spotlight one representative target).
  if (target.fromParam && config.resolveTarget) {
    const raw = params[target.fromParam];
    const paramValue = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
    return config.resolveTarget(actionName, target.fromParam, paramValue, config.signal);
  }

  // fromTarget: resolve lazily from AgentTarget registry by name
  if (target.fromTarget && config.resolveNamedTarget) {
    return config.resolveNamedTarget(actionName, target.fromTarget, config.signal, params);
  }

  // Static element
  return target.element;
}

async function executeInstant(
  action: RegisteredAction,
  params: Record<string, unknown>,
): Promise<ExecutionResult> {
  try {
    if (action.onExecute) {
      await action.onExecute(params);
    } else {
      const targets = action.getExecutionTargets();
      for (const target of targets) {
        if (target.skipIfs?.some((pred) => pred(params))) continue;
        target.element?.click();
      }
    }
    return { success: true, actionName: action.name };
  } catch (err) {
    return { success: false, actionName: action.name, error: String(err) };
  }
}

/**
 * Check whether an element is visible and measurable.
 * Returns false for detached nodes and display:contents wrappers
 * (whose getBoundingClientRect() returns all zeros).
 */
function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function executeGuided(
  action: RegisteredAction,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const targets = action.getExecutionTargets();

  // No targets, or all targets are invisible (e.g. display:contents wrappers) — run directly
  if (targets.length === 0 || targets.every((t) => t.element && !isElementVisible(t.element))) {
    if (action.onExecute) {
      await action.onExecute(params);
    }
    return { success: true, actionName: action.name };
  }

  let spotlight: SpotlightHandle | null = null;
  let cursor: OverlayHandle | null = null;
  const blocker = createBlockingOverlay();

  if (config.cursorEnabled) {
    cursor = createCursor();
  }

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const isLast = i === targets.length - 1;

      // Skip when the step (or an ancestor AgentStepGroup) declares a precondition is already satisfied.
      if (target.skipIfs?.some((pred) => pred(params))) continue;

      // Resolve element (may be lazy for fromParam steps)
      const element = await resolveStepElement(target, action.name, params, config);
      if (!element) continue;

      // Element not in DOM (never rendered) — skip for single-step, abort for multi-step
      if (!isElementVisible(element)) {
        if (targets.length > 1) {
          blocker.remove();
          cursor?.remove();
          return { success: false, actionName: action.name, error: `Step element not visible: "${target.label}"` };
        }
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
      if (target.setParam) {
        // Type the param value into the input — find the actual input/textarea within the element
        const inputEl = (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
          ? element
          : element.querySelector('input, textarea') ?? element;
        const value = String(params[target.setParam] ?? '');
        await simulateTyping(inputEl as HTMLElement, value, config.signal);
      } else if (target.setValue && target.onSetValue) {
        // Set value programmatically via callback
        const value = params[target.setValue];
        target.onSetValue(value);
      } else if (target.fromParam || target.fromTarget) {
        // Lazy-resolved step: always click the resolved target (dropdown option, popover button, etc.)
        animateCursorClick();
        element.click();
      } else if (action.onExecute) {
        // With onExecute: click intermediate steps (e.g. open dropdown),
        // skip clicking the last step (onExecute handles the action)
        if (!isLast) {
          animateCursorClick();
          element.click();
        }
      } else {
        // Without onExecute: click every step
        animateCursorClick();
        element.click();
      }

      // 5. Remove spotlight
      spotlight.remove();
      spotlight = null;

      if (!isLast) {
        await delay(200, config.signal);
      }
    }

    // 6. Call onExecute after visual sequence
    if (action.onExecute) {
      await action.onExecute(params);
    }

    blocker.remove();
    cursor?.remove();
    return { success: true, actionName: action.name };
  } catch (err) {
    // Clean up on error
    spotlight?.remove();
    blocker.remove();
    cursor?.remove();

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, actionName: action.name, error: 'Execution cancelled' };
    }
    return { success: false, actionName: action.name, error: String(err) };
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
