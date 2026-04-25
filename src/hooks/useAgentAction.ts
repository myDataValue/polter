import { useContext, useEffect, useRef } from 'react';
import type { ExecutionTarget, StepDefinition } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface AgentActionConfig {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<any>;
  /** Steps the agent walks through to drive the UI. Overrides defineAction steps when provided. */
  steps: StepDefinition[];
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Awaited after all steps complete. Use for waiting on async work triggered
   * by a step click (e.g. a mutation or streaming response). This should WAIT
   * for work, not DO work — the steps drive the UI.
   */
  awaitResult?: () => void | Promise<void>;
}

/**
 * Hook-based action registration for actions that don't wrap a single element.
 * Use this for per-row actions where AgentTargets are on scattered elements
 * and the action resolves to them via fromParam/fromTarget.
 *
 * Every action requires an `action` definition (from `defineAction`) and `steps`.
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
      const awaitResult = item.awaitResult;

      registerAction({
        name: item.action.name,
        description: item.action.description,
        parameters: item.action.parameters,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        awaitResult: awaitResult ? () => awaitResult() : undefined,
        // Look up `steps` fresh per execute so inline step closures see the
        // latest render's values; other fields are snapshot at mount.
        getExecutionTargets: (): ExecutionTarget[] => {
          const steps = configRef.current.find(
            (i) => i.action.name === item.action.name,
          )?.steps;
          if (!steps?.length) return [];
          return steps.map((s) => ({ ...s, element: null }));
        },
      });
    }

    return () => {
      for (const item of configRef.current) {
        unregisterAction(item.action.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
