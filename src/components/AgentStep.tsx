import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentStepContext } from './AgentAction';
import { AgentStepGroupContext } from './AgentStepGroup';
import type { SkipPredicate } from '../core/types';

interface AgentStepProps {
  label: string;
  children?: React.ReactNode;
  /** Resolve the target element from the AgentTarget registry by matching this param's value. */
  fromParam?: string;
  /** Resolve a named target from the AgentTarget registry (for static elements inside popovers/dropdowns). */
  fromTarget?: string;
  /** Simulate typing the value of this param into the element. */
  setParam?: string;
  /** Set a value programmatically via onSetValue callback. */
  setValue?: string;
  /** Callback for setValue — receives the param value and sets it on the component. */
  onSetValue?: (value: unknown) => void;
  /** Run a callback to prepare the DOM (e.g. scroll a virtualized list) before resolving the target. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
  /** Skip the step at execution time when the predicate returns true (preconditions already satisfied). */
  skipIf?: SkipPredicate;
}

export function AgentStep({
  label,
  children,
  fromParam,
  fromTarget,
  setParam,
  setValue,
  onSetValue,
  prepareView,
  skipIf,
}: AgentStepProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepContext = useContext(AgentStepContext);
  const { skipIfs: ancestorSkipIfs } = useContext(AgentStepGroupContext);

  if (!stepContext) {
    throw new Error('AgentStep must be used within an AgentAction');
  }

  const onSetValueRef = useRef(onSetValue);
  onSetValueRef.current = onSetValue;
  const prepareViewRef = useRef(prepareView);
  prepareViewRef.current = prepareView;
  const skipIfRef = useRef(skipIf);
  skipIfRef.current = skipIf;

  const ownSkipIfRef = useRef<SkipPredicate | null>(null);
  if (!ownSkipIfRef.current) {
    ownSkipIfRef.current = (params) => skipIfRef.current?.(params) ?? false;
  }
  const ownSkipIf = ownSkipIfRef.current;

  useEffect(() => {
    const element = children
      ? (wrapperRef.current?.firstElementChild as HTMLElement | null)
      : null;

    stepContext.registerStep(id, {
      label,
      element,
      fromParam,
      fromTarget,
      setParam,
      setValue,
      onSetValue: onSetValueRef.current,
      prepareView: prepareViewRef.current,
      skipIfs: [...ancestorSkipIfs, ownSkipIf],
    });
    return () => stepContext.unregisterStep(id);
  }, [id, label, fromParam, fromTarget, setParam, setValue, stepContext, ancestorSkipIfs, ownSkipIf]);

  if (!children) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
