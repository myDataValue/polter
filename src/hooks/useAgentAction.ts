import { useContext, useEffect, useEffectEvent } from 'react';
import type { ActionDefinition, StepDefinition } from '../core/types';
import { AgentActionContext } from '../components/AgentActionProvider';

export function useAgentAction(...configs: ActionDefinition<any>[]): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const { registerAction, unregisterAction } = context;

  const getSteps = useEffectEvent((actionName: string): StepDefinition[] => {
    const item = configs.find((c) => c.name === actionName);
    return (item?.steps as StepDefinition[] | undefined) ?? [];
  });

  const resolveWaitFor = useEffectEvent(async (actionName: string) => {
    const item = configs.find((c) => c.name === actionName);
    const wf = item?.waitFor;
    if (!wf) return;
    if (typeof wf === 'function') { await wf(); return; }
    await wf.current;
  });

  useEffect(() => {
    for (const config of configs) {
      registerAction({
        ...config,
        disabled: config.disabled ?? false,
        waitFor: config.waitFor ? () => resolveWaitFor(config.name) : undefined,
        resolveSteps: () => getSteps(config.name),
      });
    }
    return () => {
      for (const config of configs) {
        unregisterAction(config.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
