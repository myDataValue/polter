import { useContext, useEffect, useEffectEvent } from 'react';
import type { StepDefinition } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface AgentActionConfig {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<any>;
  /** Steps the agent walks through to drive the UI. Overrides defineAction steps when provided.
   *  Omit to keep defineAction steps and only provide waitFor/disabled from the component. */
  steps?: StepDefinition[];
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
}

/**
 * Hook-based action registration for actions that don't wrap a single element.
 * Use this for per-row actions where AgentTargets are on scattered elements
 * and the action resolves to them via the step's `target` field.
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
  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    for (const item of normalized) {
      const waitFor = item.waitFor;

      registerAction({
        name: item.action.name,
        description: item.action.description,
        parameters: item.action.parameters,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        componentBacked: true,
        waitFor: waitFor
          ? typeof waitFor === 'function'
            ? () => waitFor()
            : async () => { await waitFor.current; }
          : undefined,
        getExecutionTargets: () => getSteps(item.action.name),
      });
    }

    return () => {
      for (const item of normalized) {
        unregisterAction(item.action.name);
      }
    };
  }, [registerAction, unregisterAction]);

  const getSteps = useEffectEvent((actionName: string) => {
    const steps = normalized.find((i) => i.action.name === actionName)?.steps;
    if (!steps?.length) return [];
    return steps.map((s) => ({ ...s, element: null }));
  });
}
