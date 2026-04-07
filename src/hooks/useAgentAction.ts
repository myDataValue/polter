import { useContext, useEffect, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import { AgentActionContext } from '../components/AgentActionProvider';

interface StepConfig {
  label: string;
  fromParam?: string;
  fromTarget?: string;
  setParam?: string;
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentActionConfig {
  name: string;
  description: string;
  parameters?: unknown;
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  steps?: StepConfig[];
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

  const configRef = useRef(config);
  configRef.current = config;

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    const items = Array.isArray(configRef.current) ? configRef.current : [configRef.current];

    for (const item of items) {
      const onExecute = item.onExecute;
      const steps = item.steps;

      const actionName = item.name;
      registerAction({
        name: actionName,
        description: item.description,
        parameters: item.parameters,
        // Read onExecute from configRef at call time so it always uses the
        // latest closure (e.g. freshly-loaded allTags, up-to-date state).
        onExecute: onExecute
          ? (params: Record<string, unknown>) => {
              const current = Array.isArray(configRef.current) ? configRef.current : [configRef.current];
              const latest = current.find((c) => c.name === actionName);
              return (latest?.onExecute ?? onExecute)(params);
            }
          : undefined,
        disabled: item.disabled ?? false,
        disabledReason: item.disabledReason,
        getExecutionTargets: (): ExecutionTarget[] => {
          // Read steps from configRef at call time for up-to-date disabled/setValue callbacks
          const current = Array.isArray(configRef.current) ? configRef.current : [configRef.current];
          const latest = current.find((c) => c.name === actionName);
          const latestSteps = latest?.steps ?? steps;
          if (!latestSteps?.length) return [];
          return latestSteps.map((s) => ({
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
        unregisterAction(item.name);
      }
    };
  }, [registerAction, unregisterAction]);
}
