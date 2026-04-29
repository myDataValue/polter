import { useContext, useEffect, useEffectEvent } from 'react';
import type { z } from 'zod';
import type { StepDefinition } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from '../components/AgentActionProvider';

export interface AgentActionConfig<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<TSchema>;
  /** Steps the agent walks through to drive the UI. */
  steps?: StepDefinition<z.infer<TSchema>>[];
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Waited on after all steps complete. Holds the action open until async work
   * triggered by a step click finishes.
   */
  waitFor?: React.RefObject<Promise<unknown> | undefined> | (() => void | Promise<void>);
}

export function useAgentAction(...configs: AgentActionConfig<any>[]): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const { registerAction, unregisterAction } = context;

  const getSteps = useEffectEvent((actionName: string): StepDefinition[] => {
    const item = configs.find((c) => c.action.name === actionName);
    return (item?.steps as StepDefinition[] | undefined) ?? [];
  });

  const resolveWaitFor = useEffectEvent(async (actionName: string) => {
    const item = configs.find((c) => c.action.name === actionName);
    const wf = item?.waitFor;
    if (!wf) return;
    if (typeof wf === 'function') { await wf(); return; }
    await wf.current;
  });

  useEffect(() => {
    for (const config of configs) {
      registerAction({
        ...config.action,
        disabled: config.disabled ?? false,
        disabledReason: config.disabledReason,
        waitFor: config.waitFor ? () => resolveWaitFor(config.action.name) : undefined,
        resolveSteps: () => getSteps(config.action.name),
      });
    }
    return () => {
      for (const config of configs) {
        unregisterAction(config.action.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
