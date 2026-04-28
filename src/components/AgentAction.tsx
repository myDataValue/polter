import React, { useContext, useEffect, useEffectEvent, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from './AgentActionProvider';

interface AgentActionProps {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<any>;
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Waited on after all steps complete. Holds the action open until async work
   * triggered by a step click finishes.
   *
   * Pass a React ref whose `.current` is set to a Promise by the click handler
   * (safe — impossible to do work in a ref), or a function returning a Promise
   * (escape hatch for custom promise construction).
   */
  waitFor?: React.RefObject<Promise<unknown> | undefined> | (() => void | Promise<void>);
  children?: React.ReactNode;
}

export function AgentAction(props: AgentActionProps) {
  const {
    action,
    disabled = false,
    disabledReason,
    waitFor,
    children,
  } = props;

  const name = action.name;
  const description = action.description;

  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('AgentAction must be used within an AgentActionProvider');
  }

  const wrapperRef = useRef<HTMLDivElement>(null);

  const stableWaitFor = useEffectEvent(async () => {
    if (!waitFor) return;
    if (typeof waitFor === 'function') { await waitFor(); return; }
    await waitFor.current;
  });

  const getExecutionTargets = useEffectEvent((): ExecutionTarget[] => {
    let el = wrapperRef.current?.firstElementChild as HTMLElement | null;
    while (el && getComputedStyle(el).display === 'contents' && el.firstElementChild) {
      el = el.firstElementChild as HTMLElement;
    }
    return el ? [{ label: description, element: el }] : [];
  });

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    registerAction({
      name,
      description,
      parameters: action.parameters,
      disabled,
      disabledReason,
      waitFor: waitFor ? stableWaitFor : undefined,
      getExecutionTargets,
      componentBacked: true,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, !!waitFor, registerAction, unregisterAction]);

  if (!children) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
