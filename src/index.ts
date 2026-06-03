// Components
export { AgentActionProvider } from './components/AgentActionProvider';
export { AgentAction } from './components/AgentAction';
export { AgentTarget } from './components/AgentTarget';
export { AgentDevTools } from './components/AgentDevTools';

// Hooks
export { useAgentAction } from './hooks/useAgentAction';
export { useAgentActions } from './hooks/useAgentActions';
export { useAgentCommandRouter } from './hooks/useAgentCommandRouter';

// Helpers
export { defineAction, fromParam } from './core/helpers';

// Schema utilities
export { zodToJsonSchema, generateToolSchemas } from './core/schemaGenerator';

// Flexible target resolution (attribute-based, complements exact-name lookup)
export {
  matchTargets,
  scoreTarget,
  scoreAttrValue,
  MATCH_THRESHOLD,
  AMBIGUITY_MARGIN,
} from './resolvers';
export type {
  TargetAttrValue,
  TargetAttrs,
  TargetIntent,
  DescribedTarget,
  TargetCandidate,
  TargetMatch,
} from './resolvers';

// Types
export type {
  ActionSchema,
  ActionDefinition,
  ExecutionMode,
  ScrollDispatch,
  StepDefinition,
  TargetDefinition,
  AgentTargetEntry,
  RegisteredAction,
  ToolSchema,
  StepTrace,
  ResolveDiagnostics,
  ResolveResult,
  ExecutionResult,
  AvailableAction,
  ExecutorConfig,
  AgentActionProviderProps,
  AgentActionContextValue,
} from './core/types';
