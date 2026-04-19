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
  /** Run a callback to prepare component state before the agent interacts with this target. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface RegisteredAction {
  name: string;
  description: string;
  parameters?: unknown;
  disabled: boolean;
  disabledReason?: string;
  getExecutionTargets: () => ExecutionTarget[];
  /**
   * Awaited after all steps complete. Use for waiting on async work triggered
   * by a step click (e.g. a mutation or streaming response). This should WAIT
   * for work, not DO work — the steps drive the UI.
   */
  awaitResult?: () => void | Promise<void>;
  /** Client-side route for navigation before execution (from defineAction). */
  route?: (params: Record<string, unknown>) => string;
  /** Chain of action names to execute sequentially before this action (from defineAction). */
  navigateVia?: string[];
  /** How long (ms) to wait for this action's component to mount after navigation. */
  mountTimeout?: number;
  /** True when registered by an `<AgentAction>` component (vs schema-only from registry). */
  componentBacked?: boolean;
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
    params?: Record<string, unknown>,
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
  /** Pre-defined actions whose schemas are available before their components mount. */
  registry?: import('./defineAction').ActionDefinition<any>[];
  /** Router integration — called when executing a registry action that needs navigation. */
  navigate?: (path: string) => void | Promise<void>;
  /** Enable dev-mode console warnings for actions missing from the registry. */
  devWarnings?: boolean;
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
