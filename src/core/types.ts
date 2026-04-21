export type ExecutionMode = 'guided' | 'instant';

export type SkipPredicate = (params: Record<string, unknown>) => boolean;

/** Shared fields describing an agent step's behavior — consumed by AgentStep props, StepConfig (useAgentAction), and ExecutionTarget. */
export interface StepDefinition {
  label: string;
  /** Resolve element from AgentTarget registry by matching this param's value. */
  fromParam?: string;
  /** Resolve element from AgentTarget registry by matching a named target. */
  fromTarget?: string;
  /** Simulate typing the value of this param into the element. */
  setParam?: string;
  /** Set a value programmatically via onSetValue callback. */
  setValue?: string;
  /** Callback for setValue — receives the param value and sets it on the component. */
  onSetValue?: (value: unknown) => void;
  /** Fallback for params[fromParam/setParam/setValue] when the param is absent — lets a step target a fixed value without a matching param. */
  defaultValue?: string;
  /** Run a callback to prepare the DOM (e.g. scroll virtualized list) before resolving. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface ExecutionTarget extends StepDefinition {
  element: HTMLElement | null;
  /** The step is skipped at execution time when this predicate returns true. */
  skipIf?: SkipPredicate;
}

/** Shared fields describing an AgentTarget — consumed by AgentTarget props and the registered AgentTargetEntry. */
export interface TargetDefinition {
  /** The action name this target belongs to. Omit to make a shared target that any action can resolve. */
  action?: string;
  /** The parameter key this target maps to (for fromParam resolution). */
  param?: string;
  /** The parameter value this target represents (for fromParam resolution). */
  value?: string;
  /** Named target key (for fromTarget resolution — static elements inside popovers/dropdowns). */
  name?: string;
  /** Run a callback to prepare component state before the agent interacts with this target. Runs in the child's scope so it can access internal state. */
  prepareView?: (params: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentTargetEntry extends TargetDefinition {
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
