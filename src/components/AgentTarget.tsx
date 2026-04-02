import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentActionContext } from './AgentActionProvider';

interface AgentTargetProps {
  /** The action name this target belongs to. */
  action: string;
  /** The parameter key this target maps to. */
  param: string;
  /** The parameter value this target represents. Matched against the agent's param value. */
  value: string;
  children: React.ReactNode;
}

/**
 * Register a DOM element as a selectable target for an agent action step.
 *
 * Use this to wrap lazily-rendered elements (dropdown options, search results, etc.)
 * so that `AgentStep fromParam` can find and interact with them after they mount.
 *
 * Works through React portals — context flows regardless of DOM position.
 *
 * @example
 * ```tsx
 * // Inside a MultiSelect's renderOption:
 * <AgentTarget action="filter_by_tag" param="tag_name" value={option.label}>
 *   <DropdownOption>{option.label}</DropdownOption>
 * </AgentTarget>
 * ```
 */
export function AgentTarget({ action, param, value, children }: AgentTargetProps) {
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
      registerTarget(id, { action, param, value, element });
    }
    return () => unregisterTarget(id);
  }, [id, action, param, value, registerTarget, unregisterTarget]);

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
