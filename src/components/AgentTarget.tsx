import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentActionContext } from './AgentActionProvider';

interface AgentTargetProps {
  /** The action name this target belongs to. Omit to make a shared target that any action can resolve. */
  action?: string;
  children: React.ReactNode;
  /** The parameter key this target maps to (for fromParam resolution). */
  param?: string;
  /** The parameter value this target represents (for fromParam resolution). */
  value?: string;
  /** Named target key (for fromTarget resolution — static elements inside popovers/dropdowns). */
  name?: string;
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
export function AgentTarget({ action, param, value, name, children }: AgentTargetProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const context = useContext(AgentActionContext);

  if (!context) {
    throw new Error('AgentTarget must be used within an AgentActionProvider');
  }

  const { registerTarget, unregisterTarget } = context;

  useEffect(() => {
    const element = wrapperRef.current?.firstElementChild as HTMLElement | null;
    if (element) {
      registerTarget(id, { action, param, value, name, element });
    }
    return () => unregisterTarget(id);
  }, [id, action, param, value, name, registerTarget, unregisterTarget]);

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
