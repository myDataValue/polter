export type ExecutionMode = 'guided' | 'instant';

export interface ExecutionTarget {
  label: string;
  element: HTMLElement | null;
  /** Resolve element from AgentTarget registry by matching this param's value. */
  fromParam?: string;
  /** Simulate typing the value of this param into the element. */
  setParam?: string;
  /** Set a value programmatically via onSetValue callback. */
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  /** Run a callback to prepare the DOM (e.g. scroll virtualized list) before resolving. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentTargetEntry {
  action: string;
  param: string;
  value: string;
  element: HTMLElement;
}

export interface RegisteredAction {
  name: string;
  description: string;
  parameters?: unknown;
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled: boolean;
  disabledReason?: string;
  getExecutionTargets: () => ExecutionTarget[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  actionName: string;
  error?: string;
}

export interface AvailableAction {
  name: string;
  description: string;
  disabled: boolean;
  disabledReason?: string;
  hasParameters: boolean;
}

export interface ExecutorConfig {
  mode: ExecutionMode;
  stepDelay: number;
  overlayOpacity: number;
  spotlightPadding: number;
  tooltipEnabled: boolean;
  signal?: AbortSignal;
  /** Resolve an element from the AgentTarget registry. Used by fromParam steps. */
  resolveTarget?: (
    actionName: string,
    param: string,
    value: string,
    signal?: AbortSignal,
  ) => Promise<HTMLElement | null>;
}

export interface AgentActionProviderProps {
  mode?: ExecutionMode;
  stepDelay?: number;
  overlayOpacity?: number;
  spotlightPadding?: number;
  tooltipEnabled?: boolean;
  children: React.ReactNode;
  onExecutionStart?: (actionName: string) => void;
  onExecutionComplete?: (result: ExecutionResult) => void;
}

export interface AgentActionContextValue {
  registerAction: (action: RegisteredAction) => void;
  unregisterAction: (name: string) => void;
  registerTarget: (id: string, entry: AgentTargetEntry) => void;
  unregisterTarget: (id: string) => void;
  execute: (actionName: string, params?: Record<string, unknown>) => Promise<ExecutionResult>;
  availableActions: AvailableAction[];
  schemas: ToolSchema[];
  openaiTools: OpenAITool[];
  anthropicTools: AnthropicTool[];
  isExecuting: boolean;
  mode: ExecutionMode;
}
