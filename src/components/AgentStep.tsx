import React, { useContext, useEffect, useId, useRef } from 'react';
import { AgentStepContext } from './AgentAction';

interface AgentStepProps {
  label: string;
  children: React.ReactNode;
}

export function AgentStep({ label, children }: AgentStepProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepContext = useContext(AgentStepContext);

  if (!stepContext) {
    throw new Error('AgentStep must be used within an AgentAction');
  }

  useEffect(() => {
    const element = wrapperRef.current?.firstElementChild as HTMLElement | null;
    stepContext.registerStep(id, { label, element });
    return () => stepContext.unregisterStep(id);
  }, [id, label, stepContext]);

  return (
    <div ref={wrapperRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
