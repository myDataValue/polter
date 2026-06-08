import type { z } from 'zod';
import type { TargetAttrs, TargetIntent } from '../resolvers/types';

export type ExecutionMode = 'guided' | 'instant';

/**
 * Declarative scroll directive — dispatches a CustomEvent on window so a
 * listener (typically a virtualized table) can bring the target row into view.
 *
 * Arbitrary code execution is intentionally not supported here. If you find
 * yourself wanting setState or a mutation, that should be a step the agent
 * clicks — not a side effect masquerading as a scroll.
 */
export interface ScrollDispatch<TParams = Record<string, unknown>> {
  /** Event name dispatched on `window`. The page listens and scrolls accordingly. */
  readonly dispatchEvent: string;
  /** Builder for the CustomEvent's `detail` payload. Receives the action's params. */
  readonly detail?: (params: TParams) => unknown;
}

/**
 * Action schema — used by `defineAction()` in registry files.
 * Describes WHAT, WHERE, and (for cross-page actions) HOW.
 * Components extend with runtime state via `useAgentAction()`.
 */
export interface ActionSchema<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> {
  readonly name: string;
  readonly description: string;
  /** Zod schema for action parameters. */
  readonly parameters?: TSchema;
  /**
   * AgentTarget name(s) to click before executing steps. The agent visibly
   * clicks each named target in sequence — same as a human would.
   *
   * URL-based navigation is intentionally not supported. Pages that aren't
   * reachable by clicking a visible link aren't reachable by ADUI either —
   * either add a clickable entry point, or have the user navigate manually.
   */
  readonly navigateTo?: string | string[];
  /** Steps the agent walks through to drive the UI. */
  readonly steps?: StepDefinition<z.infer<TSchema>>[];
}

/**
 * Full action config — used by `useAgentAction()` in components.
 * Extends ActionSchema with runtime state (disabled, waitFor).
 */
export interface ActionDefinition<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> extends ActionSchema<TSchema> {
  /** When set, the action is disabled and this string is the reason. */
  readonly disabledReason?: string;
  /**
   * Awaited after all steps complete. Holds the action open until async work
   * triggered by a step click finishes.
   *
   * A React ref whose `.current` is set to a Promise by the click handler.
   * The ref form is the only form — it makes accidental work-in-the-callback
   * impossible (you can only assign a Promise to the ref, not run code).
   */
  readonly waitFor?: React.RefObject<Promise<unknown> | undefined>;
}

/** Describes a single step in an agent action. */
export interface StepDefinition<TParams = Record<string, unknown>> {
  readonly label: string;
  /**
   * Resolve element from the AgentTarget registry by matching `name`. Pass a
   * string for static targets, or a function receiving params for per-row
   * targets (e.g. `target: (p) => `edit:${p.property_id}``).
   */
  readonly target?: string | ((params: TParams) => string);
  /**
   * Optional semantic fallback for resolving the target. When the exact `target`
   * name isn't found in the registry, the executor matches this intent (role +
   * attrs) against registered targets' self-descriptions — tolerant of partial
   * id-sets, labels, and number-vs-string ids. Static, or per-params.
   */
  readonly intent?: TargetIntent | ((params: TParams) => TargetIntent | undefined);
  /**
   * Value to type into the target element. When present, the executor types
   * into the resolved element instead of clicking it.
   *
   * - `string` — literal value (e.g. `value: ''` to clear a search box).
   * - `(params) => string | undefined` — resolved at execution time from
   *   action params. Return `undefined` to skip typing and fall through to
   *   a click.
   */
  readonly value?: string | ((params: TParams) => string | undefined);
  /**
   * Scroll a virtualized list or viewport so the target element renders in
   * DOM. Declarative only — the engine dispatches a CustomEvent that the
   * page listens for. No arbitrary code, no setState shortcuts.
   */
  readonly scrollTo?: ScrollDispatch<TParams>;
  /** Skip this step at execution time when the predicate returns true. */
  readonly skipIf?: (params: TParams) => boolean;
  /**
   * Per-step resolve timeout in ms (default 5000). Use a short value for a "try the
   * already-visible target" probe so it fails fast when the target isn't rendered and the
   * caller can fall back (e.g. to a search-then-click path) without a long stall.
   */
  readonly timeout?: number;
}

/** Shared fields describing an AgentTarget — consumed by AgentTarget props and the registered AgentTargetEntry. */
export interface TargetDefinition {
  /**
   * Identifier the agent step's `target` resolves to. Encode action scope
   * and/or row identity into the name (e.g. `name={`edit_markup:${id}`}`).
   */
  readonly name: string;
  /**
   * Optional structured self-description for flexible, attribute-based resolution.
   * When a step can't be matched by exact `name`, the executor scores its `intent`
   * against these (e.g. `role: 'type', attrs: { label: 'Apartments', ids: ['201','219'] }`),
   * so a partial id-set / label / number-vs-string id still finds this target.
   */
  readonly role?: string;
  readonly attrs?: TargetAttrs;
}

export interface AgentTargetEntry extends TargetDefinition {
  readonly element: HTMLElement;
}

export interface RegisteredAction<TSchema extends z.ZodType = any>
  extends Pick<ActionDefinition<TSchema>, 'name' | 'description' | 'parameters' | 'navigateTo' | 'disabledReason'> {
  /** Returns the current steps with fresh closures (via useEffectEvent). */
  readonly resolveSteps: () => StepDefinition<z.infer<TSchema>>[];
  /** Resolved waitFor — always a function (ref form is resolved at registration).
   *  Its resolved value is surfaced as ExecutionResult.outcome so the caller can
   *  report what actually happened (e.g. applied immediately vs. confirmed). */
  readonly waitFor?: () => unknown;
}

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * Why target resolution ended, plus the registry state at that moment. Recorded
 * on the step trace so "Copy debug" explains a hang/miss without console digging:
 * matchCount === 0 means no element with that name was mounted (e.g. its row was
 * virtualized out / scrolled to the wrong index); `candidates` lists mounted
 * targets sharing the same prefix, which surfaces ID mismatches and typos.
 */
export interface ResolveDiagnostics {
  readonly reason: 'found' | 'aborted' | 'skipped' | 'disabled' | 'timeout' | 'unmounted';
  readonly matchCount: number;
  readonly componentMounted: boolean;
  readonly seenDisabled: boolean;
  readonly elapsedMs: number;
  /** Mounted target names sharing the requested name's prefix (ID mismatch hint). */
  readonly candidates?: readonly string[];
}

export interface ResolveResult {
  readonly element: HTMLElement | null;
  readonly diagnostics: ResolveDiagnostics;
}

interface StepTraceBase {
  readonly index: number;
  readonly label: string;
  readonly targetType?: 'dynamic' | 'static';
  readonly targetName?: string;
  readonly durationMs: number;
  /** Target-resolution diagnostics (present when a target was looked up). */
  readonly resolve?: ResolveDiagnostics;
}

export type StepTrace =
  | (StepTraceBase & {
    readonly status: 'completed';
    readonly targetFound: true;
    readonly interactionType: 'click' | 'type';
  })
  | (StepTraceBase & {
    readonly status: 'skipped';
    readonly targetFound: false;
    readonly interactionType: 'none';
  })
  | (StepTraceBase & {
    readonly status: 'failed';
    readonly targetFound: boolean;
    readonly interactionType: 'none';
    readonly error: string;
  });

export interface ExecutionResult {
  readonly actionName: string;
  /** Present when execution failed — absence means success. */
  readonly error?: string;
  readonly trace: readonly StepTrace[];
  readonly durationMs: number;
  /** Value the action's `waitFor` promise resolved to, if any. Lets an action
   *  report a structured outcome to the agent (e.g. whether a confirmation card
   *  was shown) instead of the agent inferring it from a static prompt. */
  readonly outcome?: unknown;
}

export interface AvailableAction {
  readonly name: string;
  readonly description: string;
  readonly disabledReason?: string;
  readonly hasParameters: boolean;
}

export interface ExecutorConfig {
  mode: ExecutionMode;
  stepDelay: number;
  overlayOpacity: number;
  spotlightPadding: number;
  tooltipEnabled: boolean;
  cursorEnabled: boolean;
  signal?: AbortSignal;
  /** When true, emit verbose `[polter]` console logs during execution. */
  debug?: boolean;
  /**
   * Resolve a target from the AgentTarget registry. Matches the exact `name` first;
   * if that isn't registered and an `intent` is supplied, falls back to flexible
   * attribute-based resolution against targets' self-descriptions. Returns the
   * element plus resolution diagnostics.
   */
  resolveTarget?: (
    actionName: string,
    name: string,
    signal?: AbortSignal,
    params?: Record<string, unknown>,
    timeout?: number,
    skipCheck?: () => boolean,
    intent?: TargetIntent,
  ) => Promise<ResolveResult>;
}

export interface AgentActionProviderProps {
  mode?: ExecutionMode;
  stepDelay?: number;
  overlayOpacity?: number;
  spotlightPadding?: number;
  tooltipEnabled?: boolean;
  cursorEnabled?: boolean;
  /**
   * Max time (ms) to wait, after a navigation, for the destination page's
   * component to mount and supply a cross-page action's real steps. A heavy
   * page can take several seconds to render; too short a wait silently drops
   * those steps (the action then reports a bare-navigation "success"). Defaults
   * to 15000, matching the in-step mounted-grace in `resolveTarget`.
   */
  mountTimeout?: number;
  children: React.ReactNode;
  onExecutionStart?: (actionName: string) => void;
  onExecutionComplete?: (result: ExecutionResult) => void;
  /** Pre-defined actions whose schemas are available before their components mount. */
  registry?: ActionSchema<any>[];
  /**
   * When true, emit verbose `[polter]` console logs during target resolution
   * and execution, plus dev-mode warnings for actions missing from the
   * registry — use to diagnose hangs (target never mounts, polls forever).
   */
  debug?: boolean;
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
