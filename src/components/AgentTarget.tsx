import type React from 'react';
import { useContext, useEffect, useId, useRef } from 'react';
import type { TargetDefinition } from '../core/types';
import { AgentActionContext } from './AgentActionProvider';

interface AgentTargetProps extends TargetDefinition {
  children: React.ReactNode;
}

/**
 * Register a DOM element as a selectable target for an agent action step.
 *
 * Use this to wrap lazily-rendered elements (dropdown options, search results, etc.)
 * so that a step's `target` field can find and interact with them after they
 * mount. Works through React portals — context flows regardless of DOM position.
 *
 * For per-row targets, encode the row identity into `name`:
 * `<AgentTarget name={`edit:${id}`}>...</AgentTarget>` paired with
 * `{ target: (p) => `edit:${p.id}` }` on the step.
 *
 * @example
 * ```tsx
 * // Per-row: encode the identifier into the name (inside a row renderer):
 * <AgentTarget name={`row:${option.id}`}>
 *   <DropdownOption>{option.label}</DropdownOption>
 * </AgentTarget>
 *
 * // Static: a fixed name (inside a popover that mounts lazily):
 * <AgentTarget name="freeze-btn">
 *   <button>Freeze columns</button>
 * </AgentTarget>
 * ```
 */
export function AgentTarget({ name, role, attrs, children }: AgentTargetProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const context = useContext(AgentActionContext);

  if (!context) {
    throw new Error('AgentTarget must be used within an AgentActionProvider');
  }

  const { registerTarget, unregisterTarget } = context;

  // Keep the latest self-description without forcing re-registration on every render
  // (callers typically pass an inline `attrs={{...}}` object). Re-register only when the
  // serialised content actually changes.
  const descriptionRef = useRef({ role, attrs });
  descriptionRef.current = { role, attrs };
  const attrsKey = attrs ? JSON.stringify(attrs) : '';

  // biome-ignore lint/correctness/useExhaustiveDependencies: grandfathered at Biome adoption — fix and remove over time
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const resolveAndRegister = () => {
      let element = wrapper.firstElementChild as HTMLElement | null;
      // Descend through wrapper divs (display:contents, zero dimensions) to the
      // first real element. polter's own nested wrappers (AgentAction/AgentTarget)
      // carry the data-polter-target marker, so we check that first: it is a plain
      // attribute read (no layout) and short-circuits before getComputedStyle.
      // This matters inside virtualized lists (rows constantly mounting/unmounting
      // on scroll), where reading getComputedStyle on every MutationObserver fire
      // forced ~650ms of reflow per scroll gesture. Only when the marker is absent
      // do we fall back to getComputedStyle, so a consumer's own display:contents
      // wrapper placed directly inside the target is still descended. The marker
      // path also works in jsdom.
      // biome-ignore lint/complexity/useOptionalChain: grandfathered at Biome adoption — fix and remove over time
      while (element && element.firstElementChild) {
        const isPolterWrapper = element.hasAttribute('data-polter-target');
        if (!isPolterWrapper && getComputedStyle(element).display !== 'contents') {
          break;
        }
        element = element.firstElementChild as HTMLElement;
      }
      if (element) {
        const { role: r, attrs: a } = descriptionRef.current;
        registerTarget(id, { name, element, role: r, attrs: a });
      } else {
        unregisterTarget(id);
      }
    };

    resolveAndRegister();

    // Re-register when children mount/unmount (e.g. conditional rendering inside the target).
    const observer = new MutationObserver(resolveAndRegister);
    observer.observe(wrapper, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      unregisterTarget(id);
    };
  }, [id, name, role, attrsKey, registerTarget, unregisterTarget]);

  return (
    <div ref={wrapperRef} data-polter-target="" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
