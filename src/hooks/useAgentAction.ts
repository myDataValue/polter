import { useContext, useEffect, useRef } from 'react';
import type { ExecutionTarget, StepDefinition } from '../core/types';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface AgentActionConfig {
  name: string;
  description: string;
  parameters?: unknown;
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  steps?: StepDefinition[];
}

/**
 * Hook-based action registration for actions that don't wrap a single element.
 * Use this for per-row actions where AgentTargets are on scattered elements
 * and the action resolves to them via fromParam/fromTarget.
 *
 * Accepts a single config or an array to batch-register multiple actions.
 *
 * For actions that wrap a visible element, prefer the <AgentAction> component.
 */
export function useAgentAction(config: AgentActionConfig | AgentActionConfig[]): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const configRef = useRef(config);
  configRef.current = config;

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    const items = Array.isArray(configRef.current) ? configRef.current : [configRef.current];

    for (const item of items) {
      const onExecute = item.onExecute;
      const steps = item.steps;

      registerAction({
        name: item.name,
        description: item.description,
        parameters: item.parameters,
        onExecute: onExecute
          ? (params: Record<string, unknown>) => onExecute(params)
          : undefined,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        getExecutionTargets: (): ExecutionTarget[] => {
          if (!steps?.length) return [];
          return steps.map((s) => ({ ...s, element: null }));
        },
      });
    }

    return () => {
      const items = Array.isArray(configRef.current) ? configRef.current : [configRef.current];
      for (const item of items) {
        unregisterAction(item.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
