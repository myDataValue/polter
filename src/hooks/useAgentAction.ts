import { useContext, useEffect, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface StepConfig {
  label: string;
  fromParam?: string;
  fromTarget?: string;
  setParam?: string;
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentActionConfig {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<any>;
  /** Steps the agent walks through to drive the UI. Required. */
  steps: StepConfig[];
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

  const configRef = useRef(config);
  configRef.current = config;

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    const items = Array.isArray(configRef.current) ? configRef.current : [configRef.current];

    for (const item of items) {
      const steps = item.steps;
      const awaitResult = item.awaitResult;

      registerAction({
        name: item.action.name,
        description: item.action.description,
        parameters: item.action.parameters,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        awaitResult: awaitResult ? () => awaitResult() : undefined,
        getExecutionTargets: (): ExecutionTarget[] => {
          if (!steps?.length) return [];
          return steps.map((s) => ({
            label: s.label,
            element: null,
            fromParam: s.fromParam,
            fromTarget: s.fromTarget,
            setParam: s.setParam,
            setValue: s.setValue,
            onSetValue: s.onSetValue,
            prepareView: s.prepareView,
          }));
        },
      });
    }

    return () => {
      const items = Array.isArray(configRef.current) ? configRef.current : [configRef.current];
      for (const item of items) {
        unregisterAction(item.action.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
