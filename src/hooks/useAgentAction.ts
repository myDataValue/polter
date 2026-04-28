import { useContext, useEffect, useRef } from 'react';
import type { ExecutionTarget, StepDefinition } from '../core/types';
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
  const configRef = useRef(normalized);
  configRef.current = normalized;

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    for (const item of configRef.current) {
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
