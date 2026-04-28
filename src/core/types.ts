export type ExecutionMode = 'guided' | 'instant';

export type SkipPredicate = (params: Record<string, unknown>) => boolean;

/** Describes a single step in an agent action — consumed by useAgentAction config and ExecutionTarget. */
export interface StepDefinition {
  label: string;
  /**
   * Resolve element from the AgentTarget registry by matching `name`. Pass a
   * string for static targets, or a function receiving params for per-row
   * targets (e.g. `target: (p) => `edit:${p.property_id}``).
   */
  target?: string | ((params: Record<string, unknown>) => string);
  /**
   * Value to type into the target element. When present, the executor types
   * into the resolved element instead of clicking it.
   *
   * - `string` — literal value (e.g. `value: ''` to clear a search box).
   * - `(params) => string | undefined` — resolved at execution time from
   *   action params. Return `undefined` to skip typing and fall through to
   *   a click.
   */
  value?: string | ((params: Record<string, unknown>) => string | undefined);
  /**
   * Scroll a virtualized list or viewport so the target element renders in DOM.
   * This is the ONLY legitimate use — if you're tempted to set state, call a
   * mutation, or switch a mode, that should be a step the agent clicks instead.
   */
  scrollTo?: (params: Record<string, unknown>) => void | Promise<void>;
  /** Skip this step at execution time when the predicate returns true. */
  skipIf?: SkipPredicate;
}

export interface ExecutionTarget extends StepDefinition {
  element: HTMLElement | null;
}

/** Shared fields describing an AgentTarget — consumed by AgentTarget props and the registered AgentTargetEntry. */
export interface TargetDefinition {
  /** The action name this target belongs to. Omit to make a shared target that any action can resolve. */
  action?: string;
  /**
   * Identifier the agent step's `target` resolves to. For per-row targets,
   * encode the row identity into the name (e.g. `name={`edit:${id}`}`).
   */
  name?: string;
  /**
   * Scroll a virtualized list or viewport so this target's element renders in DOM.
   * Only for making targets reachable — not for state changes or business logic.
   */
  scrollTo?: (params: Record<string, unknown>) => void | Promise<void>;
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
  /** True when registered by an `<AgentAction>` component (vs schema-only from registry). */
  componentBacked?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StepTrace {
  index: number;
  label: string;
  status: 'completed' | 'skipped' | 'failed';
  /** 'dynamic' = function target resolved per-execution; 'static' = constant string; 'element' = DOM-bound JSX child. */
  targetType?: 'dynamic' | 'static' | 'element';
  targetName?: string;
  targetFound: boolean;
  interactionType: 'click' | 'type' | 'none';
  error?: string;
  durationMs: number;
}

export interface ExecutionResult {
  success: boolean;
  actionName: string;
  error?: string;
  trace: StepTrace[];
  durationMs: number;
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
  /** Resolve a named target from the AgentTarget registry. */
  resolveTarget?: (
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
  /** Abort the currently running guided execution, cleaning up overlays and cursors. */
  abortExecution: () => void;
  availableActions: AvailableAction[];
  schemas: ToolSchema[];
  isExecuting: boolean;
  mode: ExecutionMode;
}
