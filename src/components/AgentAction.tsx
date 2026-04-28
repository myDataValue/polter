import React from 'react';
import type { ActionDefinition } from '../core/defineAction';
import { useAgentAction } from '../hooks/useAgentAction';
import { AgentTarget } from './AgentTarget';

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

export function AgentAction({ action, disabled, disabledReason, waitFor, children }: AgentActionProps) {
  useAgentAction({
    action,
    disabled,
    disabledReason,
    waitFor,
    steps: children ? [{ label: action.description, target: action.name }] : [],
  });

  if (!children) return null;

  return (
    <AgentTarget action={action.name} name={action.name}>
      {children}
    </AgentTarget>
  );
}
