import type { RegisteredAction, ExecutionResult, StepDefinition, ExecutorConfig, StepTrace } from '../core/types';

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
async function resolveStepElement(
  step: StepDefinition,
  actionName: string,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<HTMLElement | null> {
  if (step.scrollTo) {
    await step.scrollTo(params);
    await delay(200, config.signal);
  }

  if (step.target && config.resolveTarget) {
    const name = typeof step.target === 'function' ? step.target(params) : step.target;
    return config.resolveTarget(actionName, name, config.signal, params, 5000);
  }

  return null;
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
      // Tab backgrounded — skip all visuals, browser throttles setTimeout to 1s+
      if (document.hidden) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(300, config.signal);
      if (cursor) await moveCursorTo(element, config.signal);
      spotlight = createSpotlight(element, label, config);
      await delay(config.stepDelay, config.signal);
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
    async before() { },
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

  if (targets.length === 0) {
    if (action.waitFor) {
      await action.waitFor();
    }
    return { success: true, actionName: action.name, trace: [], durationMs: performance.now() - executionStart };
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
      const targetType: StepTrace['targetType'] = step.target
        ? (typeof step.target === 'function' ? 'dynamic' : 'static')
        : 'element';
      const targetName = resolvedTarget;

      const element = await resolveStepElement(step, action.name, params, config);
      if (!element) {
        if (targets.length > 1) {
          fx.cleanup();
          const reason = `target not found for step "${step.label}"`;
          stepTraces.push({
            index: i,
            label: step.label,
            status: 'failed',
            targetType,
            targetName,
            targetFound: !!element,
            interactionType: 'none',
            error: reason,
            durationMs: performance.now() - stepStart,
          });
          return { success: false, actionName: action.name, error: reason, trace: stepTraces, durationMs: performance.now() - executionStart };
        }
        stepTraces.push({
          index: i,
          label: step.label,
          status: 'skipped',
          targetType,
          targetName,
          targetFound: false,
          interactionType: 'none',
          durationMs: performance.now() - stepStart,
        });
        continue;
      }

      await fx.before(element, step.label);

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
      const { index, step: s, start } = activeStep;
      const resolved = typeof s.target === 'function' ? s.target(params) : s.target;
      stepTraces.push({
        index,
        label: s.label,
        status: 'failed',
        targetType: s.target ? (typeof s.target === 'function' ? 'dynamic' : 'static') : 'element',
        targetName: resolved,
        targetFound: false,
        interactionType: 'none',
        error: errorMsg,
        durationMs: performance.now() - start,
      });
    }

    return { success: false, actionName: action.name, error: errorMsg, trace: stepTraces, durationMs: performance.now() - executionStart };
  }
}
