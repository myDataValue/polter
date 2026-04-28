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
   * Waited on after all steps complete. Holds the action open until async work
   * triggered by a step click finishes.
   *
   * Pass a React ref whose `.current` is set to a Promise by the click handler
   * (safe — impossible to do work in a ref), or a function returning a Promise
   * (escape hatch for custom promise construction).
   */
  waitFor?: React.RefObject<Promise<unknown> | undefined> | (() => void | Promise<void>);
  children?: React.ReactNode;
}

export function AgentAction(props: AgentActionProps) {
  const {
    action,
    disabled = false,
    disabledReason,
    waitFor,
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

  const waitForRef = useRef(waitFor);
  waitForRef.current = waitFor;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  const stableWaitFor = useCallback(async () => {
    const wf = waitForRef.current;
    if (!wf) return;
    if (typeof wf === 'function') { await wf(); return; }
    await wf.current;
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => {
    if (stepsRef.current.size > 0) {
      // Map preserves insertion order, which matches JSX order via React's
      // tree-order useEffect mounting. This lets you interleave element steps
      // and lazy `target` steps in any sequence.
      return Array.from(stepsRef.current.values()).filter(
        (s) => s.element || s.target,
      );
    }

    // Single element: use wrapper's first child, skipping display:contents wrappers.
    let el = wrapperRef.current?.firstElementChild as HTMLElement | null;
    while (el && getComputedStyle(el).display === 'contents' && el.firstElementChild) {
      el = el.firstElementChild as HTMLElement;
    }
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
      waitFor: waitForRef.current ? stableWaitFor : undefined,
      getExecutionTargets,
      componentBacked: true,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, stableWaitFor, getExecutionTargets, registerAction, unregisterAction]);

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
