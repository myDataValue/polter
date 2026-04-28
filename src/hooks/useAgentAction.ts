import { useContext, useEffect, useEffectEvent } from 'react';
import type { z } from 'zod';
import type { StepDefinition } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface AgentActionConfig<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<TSchema>;
  /** Steps the agent walks through to drive the UI. Overrides defineAction steps when provided.
   *  Omit to keep defineAction steps and only provide waitFor/disabled from the component. */
  steps?: StepDefinition<z.infer<TSchema>>[];
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
 * Hook-based action registration. Accepts a single config (type-safe) or
 * an array (for batch registration).
 */
export function useAgentAction<TSchema extends z.ZodType>(config: AgentActionConfig<TSchema>): void;
export function useAgentAction(config: AgentActionConfig[]): void;
export function useAgentAction(config: AgentActionConfig | AgentActionConfig[]): void;
export function useAgentAction(config: AgentActionConfig<any> | AgentActionConfig<any>[]): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const normalized = Array.isArray(config) ? config : [config];
  const { registerAction, unregisterAction } = context;

  const getSteps = useEffectEvent((actionName: string) => {
    const item = normalized.find((i) => i.action.name === actionName);
    if (!item?.steps?.length) return [];
    return item.steps as StepDefinition[];
  });

  const resolveWaitFor = useEffectEvent(async (actionName: string) => {
    const item = normalized.find((i) => i.action.name === actionName);
    const wf = item?.waitFor;
    if (!wf) return;
    if (typeof wf === 'function') { await wf(); return; }
    await wf.current;
  });

  useEffect(() => {
    for (const item of normalized) {
      registerAction({
        name: item.action.name,
        description: item.action.description,
        parameters: item.action.parameters,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        componentBacked: true,
        waitFor: item.waitFor ? () => resolveWaitFor(item.action.name) : undefined,
        getExecutionTargets: () => getSteps(item.action.name),
      });
    }

    return () => {
      for (const item of normalized) {
        unregisterAction(item.action.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
