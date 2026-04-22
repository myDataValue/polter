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

  const normalized = Array.isArray(config) ? config : [config];
  const configRef = useRef(normalized);
  configRef.current = normalized;

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    for (const item of configRef.current) {
      registerAction({
        ...item,
        disabled: item.disabled ?? false,
        // Look up `steps` fresh per execute so inline step skipIfs see the
        // latest render's closures; other fields (onExecute, disabled, etc.)
        // are snapshot at mount.
        getExecutionTargets: (): ExecutionTarget[] => {
          const steps = configRef.current.find((i) => i.name === item.name)?.steps;
          if (!steps?.length) return [];
          return steps.map((s) => ({ ...s, element: null }));
        },
      });
    }

    return () => {
      for (const item of configRef.current) {
        unregisterAction(item.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
