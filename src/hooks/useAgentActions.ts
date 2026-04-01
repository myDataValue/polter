import { useContext } from 'react';
import type { AgentActionContextValue } from '../core/types';
import { AgentActionContext } from '../components/AgentActionProvider';

export function useAgentActions(): AgentActionContextValue {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentActions must be used within an AgentActionProvider');
  }
  return context;
}
