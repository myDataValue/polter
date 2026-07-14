import { useCallback, useContext, useEffect, useRef } from 'react';
import { AgentActionApiContext } from '../components/AgentActionProvider';
import type { ActionDefinition, StepDefinition } from '../core/types';

// Callers pass a heterogeneous list of actions, each with its own param schema, so
// the element type must be param-erased. `any` is load-bearing: `StepDefinition`'s
// callbacks are contravariant under `strictFunctionTypes`, and only `any` keeps a
// concrete `ActionDefinition<{ id: number }>` assignable (`unknown` /
// `Record<string, unknown>` / `z.ZodTypeAny` all reject it).
// biome-ignore lint/suspicious/noExplicitAny: load-bearing param erasure for a heterogeneous action collection — see comment above
export function useAgentAction(...configs: ActionDefinition<any>[]): void {
  // Deliberately the STABLE api context: a component registering actions must
  // not re-render on execution/registry churn just because it registers.
  const context = useContext(AgentActionApiContext);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: grandfathered at Biome adoption — fix and remove over time
  useEffect(buildRegistered, [buildRegistered, disabledKey]);
}
