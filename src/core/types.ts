export type ExecutionMode = 'guided' | 'instant';

export type SkipPredicate = (params: Record<string, unknown>) => boolean;

/** Shared fields describing an agent step's behavior — consumed by AgentStep props, useAgentAction config, and ExecutionTarget. */
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
  /** Skip this step at execution time when the predicate returns true. */
  skipIf?: SkipPredicate;
  /**
   * Wait for this step's target to appear in the target registry before resolving.
   * Use for steps that cross page boundaries — after clicking a nav element,
   * the next target only exists once the new page mounts. Uses the action's
   * `mountTimeout` (default 5000ms) instead of the normal 3s poll.
   */
  waitForMount?: boolean;
}

export interface ExecutionTarget extends StepDefinition {
  element: HTMLElement | null;
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
  disabled: boolean;
  disabledReason?: string;
  getExecutionTargets: () => ExecutionTarget[];
  /**
   * Waited on after all steps complete. Holds the action open until async work
   * triggered by a step click (e.g. a mutation or streaming response) finishes.
   *
   * Resolved form — always a function. The ref-vs-function distinction exists
   * only at the AgentAction/useAgentAction API surface; registration converts
   * refs to functions so the executor doesn't need to know about them.
   */
  waitFor?: () => void | Promise<void>;
  /** Client-side route for navigation before execution (from defineAction). */
  route?: (params: Record<string, unknown>) => string;
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
  /** Timeout (ms) for waitForMount steps. Defaults to 5000. */
  mountTimeout?: number;
  /** Resolve an element from the AgentTarget registry. Used by fromParam steps. */
  resolveTarget?: (
    actionName: string,
    param: string,
    value: string,
    signal?: AbortSignal,
    timeout?: number,
  ) => Promise<HTMLElement | null>;
  /** Resolve a named target from the AgentTarget registry. Used by fromTarget steps. */
  resolveNamedTarget?: (
    actionName: string,
    name: string,
    signal?: AbortSignal,
    params?: Record<string, unknown>,
    timeout?: number,
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
