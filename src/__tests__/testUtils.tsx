import React from 'react';
import { useAgentActions } from '../hooks/useAgentActions';

/**
 * Drop-in child that captures the current AgentActionProvider context into
 * a caller-supplied ref-like setter. Used by integration tests to assert on
 * `availableActions`, `schemas`, and to drive `execute()` from outside the
 * tree.
 */
export function TestConsumer({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof useAgentActions>) => void;
}) {
  const ctx = useAgentActions();
  React.useEffect(() => {
    onContext(ctx);
  });
  return null;
}
