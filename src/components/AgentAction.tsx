import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ExecutionTarget } from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { AgentActionContext } from './AgentActionProvider';

interface AgentStepContextValue {
  registerStep: (id: string, data: ExecutionTarget) => void;
  unregisterStep: (id: string) => void;
}

export const AgentStepContext = createContext<AgentStepContextValue | null>(null);

interface AgentActionProps {
  /** The action definition — provides name, description, parameters. */
  action: ActionDefinition<any>;
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Awaited after all steps complete. Use for waiting on async work triggered
   * by a step click (e.g. a mutation or streaming response). This should WAIT
   * for work, not DO work — the steps drive the UI.
   */
  awaitResult?: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function AgentAction(props: AgentActionProps) {
  const {
    action,
    disabled = false,
    disabledReason,
    awaitResult,
    children,
  } = props;

  const name = action.name;
  const description = action.description;
  const parameters = action.parameters;

  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('AgentAction must be used within an AgentActionProvider');
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<Map<string, ExecutionTarget>>(new Map());

  const awaitResultRef = useRef(awaitResult);
  awaitResultRef.current = awaitResult;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  const stableAwaitResult = useCallback(() => {
    return awaitResultRef.current?.();
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => {
    if (stepsRef.current.size > 0) {
      // Map preserves insertion order, which matches JSX order via React's
      // tree-order useEffect mounting. This lets you interleave element steps
      // and lazy (fromParam/fromTarget) steps in any sequence.
      return Array.from(stepsRef.current.values()).filter(
        (s) => s.element || s.fromParam || s.fromTarget,
      );
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
      disabled,
      disabledReason,
      awaitResult: awaitResultRef.current ? stableAwaitResult : undefined,
      getExecutionTargets,
      componentBacked: true,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, stableAwaitResult, getExecutionTargets, registerAction, unregisterAction]);

  const registerStep = useCallback(
    (id: string, data: ExecutionTarget) => {
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
