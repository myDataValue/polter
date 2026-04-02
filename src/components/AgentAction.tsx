import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import { AgentActionContext } from './AgentActionProvider';

interface StepData {
  label: string;
  element: HTMLElement | null;
  fromParam?: string;
  setParam?: string;
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

interface AgentStepContextValue {
  registerStep: (id: string, data: StepData) => void;
  unregisterStep: (id: string) => void;
}

export const AgentStepContext = createContext<AgentStepContextValue | null>(null);

interface AgentActionProps {
  name: string;
  description: string;
  parameters?: unknown;
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  children?: React.ReactNode;
}

export function AgentAction({
  name,
  description,
  parameters,
  onExecute,
  disabled = false,
  disabledReason,
  children,
}: AgentActionProps) {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('AgentAction must be used within an AgentActionProvider');
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
      const steps = Array.from(stepsRef.current.values());

      // Separate steps with elements (sortable by DOM position) from fromParam steps (no element)
      const withElements = steps.filter((s) => s.element);
      const withoutElements = steps.filter((s) => !s.element && s.fromParam);

      // Sort steps with elements by DOM position
      withElements.sort((a, b) => {
        if (!a.element || !b.element) return 0;
        const pos = a.element.compareDocumentPosition(b.element);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      // Combine: element steps first (in DOM order), then fromParam steps
      const ordered = [...withElements, ...withoutElements];

      return ordered.map((s) => ({
        label: s.label,
        element: s.element,
        fromParam: s.fromParam,
        setParam: s.setParam,
        setValue: s.setValue,
        onSetValue: s.onSetValue,
        prepareView: s.prepareView,
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
