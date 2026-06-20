import { useContext } from 'react';
import { AgentActionContext } from '../components/AgentActionProvider';
import type { AgentActionContextValue } from '../core/types';

export function useAgentActions(): AgentActionContextValue {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentActions must be used within an AgentActionProvider');
  }
  return context;
}
