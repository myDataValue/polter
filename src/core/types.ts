export type ExecutionMode = 'guided' | 'instant';

export interface ExecutionTarget {
  label: string;
  element: HTMLElement | null;
  /** Resolve element from AgentTarget registry by matching this param's value. */
  fromParam?: string;
  /** Resolve element from AgentTarget registry by matching a named target. */
  fromTarget?: string;
  /** Simulate typing the value of this param into the element. */
  setParam?: string;
  /** Set a value programmatically via onSetValue callback. */
  setValue?: string;
  onSetValue?: (value: unknown) => void;
  /** Run a callback to prepare the DOM (e.g. scroll virtualized list) before resolving. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentTargetEntry {
  /** Action name — when omitted, the target is shared and matches any action. */
  action?: string;
  element: HTMLElement;
  /** Parameter key — used with `value` for param-based resolution. */
  param?: string;
  /** Parameter value — matched against the agent's param value. */
  value?: string;
  /** Named target key — used for static lazy resolution via `fromTarget`. */
  name?: string;
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
  cursorEnabled: boolean;
  signal?: AbortSignal;
  /** Resolve an element from the AgentTarget registry. Used by fromParam steps. */
  resolveTarget?: (
    actionName: string,
    param: string,
    value: string,
    signal?: AbortSignal,
  ) => Promise<HTMLElement | null>;
  /** Resolve a named target from the AgentTarget registry. Used by fromTarget steps. */
  resolveNamedTarget?: (
    actionName: string,
    name: string,
    signal?: AbortSignal,
  ) => Promise<HTMLElement | null>;
}

export interface AgentActionProviderProps {
  mode?: ExecutionMode;
  stepDelay?: number;
  overlayOpacity?: number;
  spotlightPadding?: number;
  tooltipEnabled?: boolean;
  cursorEnabled?: boolean;
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
  isExecuting: boolean;
  mode: ExecutionMode;
}
