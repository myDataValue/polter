import React, { createContext, useContext, useMemo, useRef } from 'react';
import type { SkipPredicate } from '../core/types';

interface AgentStepGroupContextValue {
  skipIfs: SkipPredicate[];
}

const EMPTY_SKIP_IFS: SkipPredicate[] = [];

export const AgentStepGroupContext = createContext<AgentStepGroupContextValue>({
  skipIfs: EMPTY_SKIP_IFS,
});

interface AgentStepGroupProps {
  /** Every `AgentStep` inside this group is skipped when the predicate returns true at execution time. */
  skipIf?: SkipPredicate;
  children?: React.ReactNode;
}

export function AgentStepGroup({ skipIf, children }: AgentStepGroupProps) {
  const parent = useContext(AgentStepGroupContext);

  const skipIfRef = useRef(skipIf);
  skipIfRef.current = skipIf;

  const ownRef = useRef<SkipPredicate | null>(null);
  if (!ownRef.current) {
    ownRef.current = (params) => skipIfRef.current?.(params) ?? false;
  }

  const value = useMemo<AgentStepGroupContextValue>(
    () => ({ skipIfs: [...parent.skipIfs, ownRef.current!] }),
    [parent.skipIfs],
  );

  return (
    <AgentStepGroupContext.Provider value={value}>
      {children}
    </AgentStepGroupContext.Provider>
  );
}
