import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import { AgentActionContext } from './AgentActionProvider';

interface AgentStepContextValue {
  registerStep: (id: string, data: { label: string; element: HTMLElement | null }) => void;
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
  const stepsRef = useRef<Map<string, { label: string; element: HTMLElement | null }>>(new Map());

  // Keep onExecute in a ref so the registered action always calls the latest version
  // without re-triggering the registration effect
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  const stableOnExecute = useCallback((params: Record<string, unknown>) => {
    return onExecuteRef.current?.(params);
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => {
    if (stepsRef.current.size > 0) {
      // Multi-step: sort by DOM position
      const steps = Array.from(stepsRef.current.values()).filter((s) => s.element);
      steps.sort((a, b) => {
        if (!a.element || !b.element) return 0;
        const pos = a.element.compareDocumentPosition(b.element);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      return steps;
    }

    // Single element: use wrapper's first child
    const el = wrapperRef.current?.firstElementChild as HTMLElement | null;
    return el ? [{ label: description, element: el }] : [];
  }, [description]);

  useEffect(() => {
    context.registerAction({
      name,
      description,
      parameters,
      onExecute: onExecuteRef.current ? stableOnExecute : undefined,
      disabled,
      disabledReason,
      getExecutionTargets,
    });
    return () => context.unregisterAction(name);
  }, [name, description, parameters, disabled, disabledReason, stableOnExecute, getExecutionTargets, context]);

  const registerStep = useCallback(
    (id: string, data: { label: string; element: HTMLElement | null }) => {
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
