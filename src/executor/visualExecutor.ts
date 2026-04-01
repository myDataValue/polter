import type { RegisteredAction, ExecutionResult, ExecutorConfig } from '../core/types';

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'react-agent-ui-styles';
  style.textContent = `
    @keyframes react-agent-ui-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.02); }
    }
    @keyframes react-agent-ui-fade-in {
      from { opacity: 0; transform: translateX(-50%) translateY(4px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
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
  container.className = 'react-agent-ui-spotlight-container';
  container.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;';

  // Box-shadow creates the dimmed overlay with a hole for the target
  const spotlight = document.createElement('div');
  spotlight.className = 'react-agent-ui-spotlight';
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
  ring.className = 'react-agent-ui-ring';
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
    animation:react-agent-ui-pulse 1.5s ease-in-out infinite;
  `;

  container.appendChild(spotlight);
  container.appendChild(ring);

  // Tooltip
  if (label && config.tooltipEnabled) {
    const tooltip = document.createElement('div');
    tooltip.className = 'react-agent-ui-tooltip';
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
      animation:react-agent-ui-fade-in 0.2s ease;
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
        target.element?.click();
      }
    }
    return { success: true, actionName: action.name };
  } catch (err) {
    return { success: false, actionName: action.name, error: String(err) };
  }
}

async function executeGuided(
  action: RegisteredAction,
  params: Record<string, unknown>,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const targets = action.getExecutionTargets();

  if (targets.length === 0) {
    if (action.onExecute) {
      await action.onExecute(params);
    }
    return { success: true, actionName: action.name };
  }

  let spotlight: SpotlightHandle | null = null;

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target.element) continue;

      // 1. Scroll into view
      target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(300, config.signal);

      // 2. Spotlight
      spotlight = createSpotlight(target.element, target.label, config);
      await delay(config.stepDelay, config.signal);

      // 3. Click (if no onExecute, or for intermediate steps with onExecute)
      const isLast = i === targets.length - 1;
      if (action.onExecute) {
        // With onExecute: click intermediate steps (e.g. open dropdown),
        // skip clicking the last step (onExecute handles the action)
        if (!isLast) {
          target.element.click();
        }
      } else {
        // Without onExecute: click every step
        target.element.click();
      }

      // 4. Remove spotlight
      spotlight.remove();
      spotlight = null;

      if (!isLast) {
        await delay(200, config.signal);
      }
    }

    // 5. Call onExecute after visual sequence
    if (action.onExecute) {
      await action.onExecute(params);
    }

    return { success: true, actionName: action.name };
  } catch (err) {
    // Clean up spotlight on error
    spotlight?.remove();

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
