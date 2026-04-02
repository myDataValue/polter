import { useCallback, useContext, useEffect, useRef } from 'react';
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

interface UseAgentActionOptions {
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
 * For actions that wrap a visible element, prefer the <AgentAction> component.
 */
export function useAgentAction({
  name,
  description,
  parameters,
  onExecute,
  disabled = false,
  disabledReason,
  steps,
}: UseAgentActionOptions): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const stableOnExecute = useCallback((params: Record<string, unknown>) => {
    return onExecuteRef.current?.(params);
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => {
    const currentSteps = stepsRef.current;
    if (!currentSteps?.length) return [];

    return currentSteps.map((s) => ({
      label: s.label,
      element: null,
      fromParam: s.fromParam,
      fromTarget: s.fromTarget,
      setParam: s.setParam,
      setValue: s.setValue,
      onSetValue: s.onSetValue,
      prepareView: s.prepareView,
    }));
  }, []);

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    registerAction({
      name,
      description,
      parameters: parametersRef.current,
      onExecute: onExecuteRef.current ? stableOnExecute : undefined,
      disabled,
      disabledReason,
      getExecutionTargets,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, stableOnExecute, getExecutionTargets, registerAction, unregisterAction]);
}
