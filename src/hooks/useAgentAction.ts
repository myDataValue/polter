import { useCallback, useContext, useEffect, useRef } from 'react';
import type { ActionDefinition, StepDefinition } from '../core/types';
import { AgentActionContext } from '../components/AgentActionProvider';

export function useAgentAction(...configs: ActionDefinition<any>[]): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const { registerAction, unregisterAction } = context;

  const configsRef = useRef(configs);
  configsRef.current = configs;

  const getSteps = useCallback((actionName: string): StepDefinition[] => {
    const item = configsRef.current.find((c) => c.name === actionName);
    return (item?.steps as StepDefinition[] | undefined) ?? [];
  }, []);

  const resolveWaitFor = useCallback(async (actionName: string): Promise<unknown> => {
    const item = configsRef.current.find((c) => c.name === actionName);
    const wf = item?.waitFor;
    if (!wf) return undefined;
    return await wf.current;
  }, []);

  const buildRegistered = useCallback(() => {
    for (const config of configsRef.current) {
      registerAction({
        ...config,
        waitFor: config.waitFor ? () => resolveWaitFor(config.name) : undefined,
        resolveSteps: () => getSteps(config.name),
      });
    }
    return () => {
      for (const config of configsRef.current) {
        unregisterAction(config.name);
      }
    };
  }, [registerAction, unregisterAction, getSteps, resolveWaitFor]);

  // Re-register whenever disabledReason changes so actionsRef stays in sync.
  const disabledKey = configs.map((c) => c.disabledReason ?? '').join('\0');
  useEffect(buildRegistered, [buildRegistered, disabledKey]);
}
