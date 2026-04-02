import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentStepContext } from './AgentAction';

interface AgentStepProps {
  label: string;
  children?: React.ReactNode;
  /** Resolve the target element from the AgentTarget registry by matching this param's value. */
  fromParam?: string;
  /** Simulate typing the value of this param into the element. */
  setParam?: string;
  /** Set a value programmatically via onSetValue callback. */
  setValue?: string;
  /** Callback for setValue — receives the param value and sets it on the component. */
  onSetValue?: (value: unknown) => void;
  /** Run a callback to prepare the DOM (e.g. scroll a virtualized list) before resolving the target. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export function AgentStep({
  label,
  children,
  fromParam,
  setParam,
  setValue,
  onSetValue,
  prepareView,
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

  useEffect(() => {
    const element = children
      ? (wrapperRef.current?.firstElementChild as HTMLElement | null)
      : null;

    stepContext.registerStep(id, {
      label,
      element,
      fromParam,
      setParam,
      setValue,
      onSetValue: onSetValueRef.current,
      prepareView: prepareViewRef.current,
    });
    return () => stepContext.unregisterStep(id);
  }, [id, label, fromParam, setParam, setValue, stepContext]);

  if (!children) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
