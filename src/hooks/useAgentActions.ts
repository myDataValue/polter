import { useContext, useMemo } from 'react';
import { AgentActionApiContext, AgentActionStateContext } from '../components/AgentActionProvider';
import type { AgentActionContextValue } from '../core/types';

/**
 * Full provider surface — callbacks AND live state. Subscribes to the volatile
 * half, so the consumer re-renders when `isExecuting` flips or the registry
 * changes. Registration-only consumers (`AgentTarget`, `useAgentAction`) use
 * the stable API context instead and skip those re-renders.
 */
export function useAgentActions(): AgentActionContextValue {
  const api = useContext(AgentActionApiContext);
  const state = useContext(AgentActionStateContext);
  if (!api || !state) {
    throw new Error('useAgentActions must be used within an AgentActionProvider');
  }
  return useMemo(() => ({ ...api, ...state }), [api, state]);
}
