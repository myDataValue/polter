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
 * so that `AgentStep fromParam` or `AgentStep fromTarget` can find and interact
 * with them after they mount.
 *
 * Works through React portals — context flows regardless of DOM position.
 *
 * @example
 * ```tsx
 * // Dynamic: match by param value (inside a dropdown's renderOption):
 * <AgentTarget action="filter_by_tag" param="tag_name" value={option.label}>
 *   <DropdownOption>{option.label}</DropdownOption>
 * </AgentTarget>
 *
 * // Static: match by name (inside a popover that mounts lazily):
 * <AgentTarget action="toggle_frozen_columns" name="freeze-btn">
 *   <button>Freeze columns</button>
 * </AgentTarget>
 * ```
 */
export function AgentTarget({ action, param, value, name, prepareView, children }: AgentTargetProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const context = useContext(AgentActionContext);
  const prepareViewRef = useRef(prepareView);
  prepareViewRef.current = prepareView;

  if (!context) {
    throw new Error('AgentTarget must be used within an AgentActionProvider');
  }

  const { registerTarget, unregisterTarget } = context;

  useEffect(() => {
    let element = wrapperRef.current?.firstElementChild as HTMLElement | null;
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
      registerTarget(id, { action, param, value, name, element, prepareView: prepareViewRef.current });
    }
    return () => unregisterTarget(id);
  }, [id, action, param, value, name, registerTarget, unregisterTarget]);

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
