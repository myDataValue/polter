import type React from 'react';
import type { ActionDefinition, ActionSchema } from '../core/types';
import { useAgentAction } from '../hooks/useAgentAction';
import { AgentTarget } from './AgentTarget';

interface AgentActionProps extends Pick<ActionDefinition, 'disabledReason' | 'waitFor'> {
  // biome-ignore lint/suspicious/noExplicitAny: grandfathered at Biome adoption — fix and remove over time
  action: ActionSchema<any>;
  children?: React.ReactNode;
}

export function AgentAction({ action, disabledReason, waitFor, children }: AgentActionProps) {
  useAgentAction({
    ...action,
    disabledReason,
    waitFor,
    steps: children ? [{ label: action.description, target: action.name }] : [],
  });

  if (!children) return null;

  return <AgentTarget name={action.name}>{children}</AgentTarget>;
}
