import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentActionContext } from './AgentActionProvider';
import type { TargetDefinition } from '../core/types';

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
export function AgentTarget({ name, scrollTo, children }: AgentTargetProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const context = useContext(AgentActionContext);
  const scrollToRef = useRef(scrollTo);
  scrollToRef.current = scrollTo;

  if (!context) {
    throw new Error('AgentTarget must be used within an AgentActionProvider');
  }

  const { registerTarget, unregisterTarget } = context;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const resolveAndRegister = () => {
      let element = wrapper.firstElementChild as HTMLElement | null;
      // Skip display:contents wrappers (e.g. nested AgentAction div) that have zero dimensions.
      // Check getComputedStyle instead of getBoundingClientRect — it works in jsdom.
      while (
        element &&
        getComputedStyle(element).display === 'contents' &&
        element.firstElementChild
      ) {
        element = element.firstElementChild as HTMLElement;
      }
      if (element) {
        registerTarget(id, { name, element, scrollTo: scrollToRef.current });
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
  }, [id, name, registerTarget, unregisterTarget]);

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
