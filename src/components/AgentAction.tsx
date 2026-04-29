import React from 'react';
import type { ActionDefinition } from '../core/types';
import { useAgentAction } from '../hooks/useAgentAction';
import { AgentTarget } from './AgentTarget';

interface AgentActionProps extends Pick<ActionDefinition, 'disabled' | 'disabledReason' | 'waitFor'> {
  action: ActionDefinition<any>;
  children?: React.ReactNode;
}

export function AgentAction({ action, disabled, disabledReason, waitFor, children }: AgentActionProps) {
  useAgentAction({
    ...action,
    disabled,
    disabledReason,
    waitFor,
    steps: children ? [{ label: action.description, target: action.name }] : [],
  });

  if (!children) return null;

  return (
    <AgentTarget name={action.name}>
      {children}
    </AgentTarget>
  );
}
