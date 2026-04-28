import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentStepContext } from './AgentAction';
import type { SkipPredicate, StepDefinition } from '../core/types';

interface AgentStepProps extends StepDefinition {
  children?: React.ReactNode;
}

export function AgentStep({
  label,
  children,
  target,
  value,
  scrollTo,
  skipIf,
}: AgentStepProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepContext = useContext(AgentStepContext);

  if (!stepContext) {
    throw new Error('AgentStep must be used within an AgentAction');
  }

  const valueRef = useRef(value);
  valueRef.current = value;
  const scrollToRef = useRef(scrollTo);
  scrollToRef.current = scrollTo;
  const skipIfRef = useRef(skipIf);
  skipIfRef.current = skipIf;

  // Stable wrappers reading the latest prop, so inline closures don't
  // re-fire the registration effect (which would reorder stepsRef's Map).
  const stableValueRef = useRef<StepDefinition['value'] | null>(null);
  if (!stableValueRef.current) {
    stableValueRef.current = (params) => {
      const v = valueRef.current;
      if (v === undefined) return undefined;
      return typeof v === 'function' ? v(params) : v;
    };
  }

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
      target,
      value: stableValueRef.current!,
      scrollTo: scrollToRef.current,
      skipIf: stableSkipIfRef.current!,
    });
    return () => stepContext.unregisterStep(id);
  }, [id, label, target, stepContext]);

  if (!children) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
