import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ExecutionTarget, SkipPredicate } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from './AgentActionProvider';

interface StepData {
  label: string;
  element: HTMLElement | null;
  fromParam?: string;
  fromTarget?: string;
  setParam?: string;
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
  skipIfs?: SkipPredicate[];
}

interface AgentStepContextValue {
  registerStep: (id: string, data: StepData) => void;
  unregisterStep: (id: string) => void;
}

export const AgentStepContext = createContext<AgentStepContextValue | null>(null);

type AgentActionProps = {
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  children?: React.ReactNode;
} & (
  | { action: ActionDefinition<any>; name?: string; description?: string; parameters?: unknown }
  | { action?: never; name: string; description: string; parameters?: unknown }
);

export function AgentAction(props: AgentActionProps) {
  const {
    action,
    onExecute,
    disabled = false,
    disabledReason,
    children,
  } = props;

  // Resolve from action definition, with inline props as overrides.
  const name = props.name ?? action?.name;
  const description = props.description ?? action?.description ?? '';
  const parameters = props.parameters ?? action?.parameters;

  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('AgentAction must be used within an AgentActionProvider');
  }
  if (!name) {
    throw new Error('AgentAction requires either a "name" prop or an "action" prop');
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<Map<string, StepData>>(new Map());

  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  const stableOnExecute = useCallback((params: Record<string, unknown>) => {
    return onExecuteRef.current?.(params);
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => {
    if (stepsRef.current.size > 0) {
      // Map preserves insertion order, which matches JSX order via React's
      // tree-order useEffect mounting. This lets you interleave element steps
      // and lazy (fromParam/fromTarget) steps in any sequence.
      const steps = Array.from(stepsRef.current.values());
      const valid = steps.filter((s) => s.element || s.fromParam || s.fromTarget);

      return valid.map((s) => ({
        label: s.label,
        element: s.element,
        fromParam: s.fromParam,
        fromTarget: s.fromTarget,
        setParam: s.setParam,
        setValue: s.setValue,
        onSetValue: s.onSetValue,
        prepareView: s.prepareView,
        skipIfs: s.skipIfs,
      }));
    }

    // Single element: use wrapper's first child
    const el = wrapperRef.current?.firstElementChild as HTMLElement | null;
    return el ? [{ label: description, element: el }] : [];
  }, [description]);

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
      componentBacked: true,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, stableOnExecute, getExecutionTargets, registerAction, unregisterAction]);

  const registerStep = useCallback(
    (id: string, data: StepData) => {
      stepsRef.current.set(id, data);
    },
    [],
  );

  const unregisterStep = useCallback((id: string) => {
    stepsRef.current.delete(id);
  }, []);

  const stepContextValue = useMemo(
    () => ({ registerStep, unregisterStep }),
    [registerStep, unregisterStep],
  );

  if (!children) return null;

  return (
    <AgentStepContext.Provider value={stepContextValue}>
      <div ref={wrapperRef} style={{ display: 'contents' }}>
        {children}
      </div>
    </AgentStepContext.Provider>
  );
}
