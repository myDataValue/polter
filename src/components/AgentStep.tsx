import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentStepContext } from './AgentAction';
import type { SkipPredicate, StepDefinition } from '../core/types';

interface AgentStepProps extends StepDefinition {
  children?: React.ReactNode;
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
  defaultValue,
  skipIf,
}: AgentStepProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepContext = useContext(AgentStepContext);

  if (!stepContext) {
    throw new Error('AgentStep must be used within an AgentAction');
  }

  const onSetValueRef = useRef(onSetValue);
  onSetValueRef.current = onSetValue;
  const prepareViewRef = useRef(prepareView);
  prepareViewRef.current = prepareView;
  const skipIfRef = useRef(skipIf);
  skipIfRef.current = skipIf;

  // Stable wrapper reading the latest `skipIf` prop, so inline closures don't
  // re-fire the registration effect (which would reorder stepsRef's Map).
  const stableSkipIfRef = useRef<SkipPredicate | null>(null);
  if (!stableSkipIfRef.current) {
    stableSkipIfRef.current = (params) => skipIfRef.current?.(params) ?? false;
  }

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
      defaultValue,
      prepareView: prepareViewRef.current,
      skipIf: stableSkipIfRef.current!,
    });
    return () => stepContext.unregisterStep(id);
  }, [id, label, fromParam, fromTarget, setParam, setValue, defaultValue, stepContext]);

  if (!children) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
