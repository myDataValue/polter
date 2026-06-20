// Components

export { AgentAction } from './components/AgentAction';
export { AgentActionProvider } from './components/AgentActionProvider';
export { AgentDevTools } from './components/AgentDevTools';
export { AgentTarget } from './components/AgentTarget';
// Helpers
export { defineAction, fromParam } from './core/helpers';
// Schema utilities
export { generateToolSchemas, zodToJsonSchema } from './core/schemaGenerator';
// Types
export type {
  ActionDefinition,
  ActionSchema,
  AgentActionContextValue,
  AgentActionProviderProps,
  AgentTargetEntry,
  AvailableAction,
  ExecutionMode,
  ExecutionResult,
  ExecutorConfig,
  RegisteredAction,
  ResolveDiagnostics,
  ResolveResult,
  ScrollDispatch,
  StepDefinition,
  StepTrace,
  TargetDefinition,
  ToolSchema,
} from './core/types';
// Hooks
export { useAgentAction } from './hooks/useAgentAction';
export { useAgentActions } from './hooks/useAgentActions';
export { useAgentCommandRouter } from './hooks/useAgentCommandRouter';
export type {
  DescribedTarget,
  TargetAttrs,
  TargetAttrValue,
  TargetCandidate,
  TargetIntent,
  TargetMatch,
} from './resolvers';
// Flexible target resolution (attribute-based, complements exact-name lookup)
export {
  AMBIGUITY_MARGIN,
  MATCH_THRESHOLD,
  matchTargets,
  scoreAttrValue,
  scoreTarget,
} from './resolvers';
