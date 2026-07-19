import type React from 'react';
import type { ActionDefinition, ActionSchema } from '../core/types';
import { useAgentAction } from '../hooks/useAgentAction';
import { AgentTarget } from './AgentTarget';

interface AgentActionProps
  extends Pick<ActionDefinition, 'disabledReason' | 'disabledIsNoop' | 'waitFor'> {
  // Param-erased so any concrete action schema is accepted. `any` is load-bearing:
  // the default `z.ZodType<Record<string, unknown>>` would reject a typed schema
  // because `StepDefinition`'s callbacks are contravariant under `strictFunctionTypes`.
  // biome-ignore lint/suspicious/noExplicitAny: load-bearing param erasure — accepts any concrete action schema; see comment above
  action: ActionSchema<any>;
  children?: React.ReactNode;
}

export function AgentAction({
  action,
  disabledReason,
  disabledIsNoop,
  waitFor,
  children,
}: AgentActionProps) {
  useAgentAction({
    ...action,
    disabledReason,
    disabledIsNoop,
    waitFor,
    steps: children ? [{ label: action.description, target: action.name }] : [],
  });

  if (!children) return null;

  return <AgentTarget name={action.name}>{children}</AgentTarget>;
}
