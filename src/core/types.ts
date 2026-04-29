import type { z } from 'zod';

export type ExecutionMode = 'guided' | 'instant';

export interface ActionDefinition<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> {
  readonly name: string;
  readonly description: string;
  /** Zod schema for action parameters. */
  readonly parameters?: TSchema;
  /** Client-side route to navigate to before executing. */
  readonly route?: (params: z.infer<TSchema>) => string;
  /** Steps the agent walks through to drive the UI. */
  readonly steps?: StepDefinition<z.infer<TSchema>>[];
  /** When set, the action is disabled and this string is the reason. */
  readonly disabledReason?: string;
  /**
   * Waited on after all steps complete. Holds the action open until async work
   * triggered by a step click finishes.
   *
   * Pass a React ref whose `.current` is set to a Promise by the click handler,
   * or a function returning a Promise.
   */
  readonly waitFor?: React.RefObject<Promise<unknown> | undefined> | (() => void | Promise<void>);
}

/** Describes a single step in an agent action. */
export interface StepDefinition<TParams = Record<string, unknown>> {
  label: string;
  /**
   * Resolve element from the AgentTarget registry by matching `name`. Pass a
   * string for static targets, or a function receiving params for per-row
   * targets (e.g. `target: (p) => `edit:${p.property_id}``).
   */
  target?: string | ((params: TParams) => string);
  /**
   * Value to type into the target element. When present, the executor types
   * into the resolved element instead of clicking it.
   *
   * - `string` — literal value (e.g. `value: ''` to clear a search box).
   * - `(params) => string | undefined` — resolved at execution time from
   *   action params. Return `undefined` to skip typing and fall through to
   *   a click.
   */
  value?: string | ((params: TParams) => string | undefined);
  /**
   * Scroll a virtualized list or viewport so the target element renders in DOM.
   * This is the ONLY legitimate use — if you're tempted to set state, call a
   * mutation, or switch a mode, that should be a step the agent clicks instead.
   */
  scrollTo?: (params: TParams) => void | Promise<void>;
  /** Skip this step at execution time when the predicate returns true. */
  skipIf?: (params: TParams) => boolean;
}

/** Shared fields describing an AgentTarget — consumed by AgentTarget props and the registered AgentTargetEntry. */
export interface TargetDefinition {
  /**
   * Identifier the agent step's `target` resolves to. Encode action scope
   * and/or row identity into the name (e.g. `name={`edit_markup:${id}`}`).
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

export interface RegisteredAction<TSchema extends z.ZodType = any> extends ActionDefinition<TSchema> {
  /** Returns the current steps with fresh closures (via useEffectEvent). */
  resolveSteps: () => StepDefinition<z.infer<TSchema>>[];
  /** Resolved waitFor — always a function. */
  readonly waitFor?: () => void | Promise<void>;
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
  /** 'dynamic' = function target resolved per-execution; 'static' = constant string. */
  targetType?: 'dynamic' | 'static';
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
  registry?: ActionDefinition<any>[];
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
