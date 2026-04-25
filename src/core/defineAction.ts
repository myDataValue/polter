import type { StepDefinition } from './types';

/**
 * Define an action at import time so its schema is available before the component mounts.
 * Pass defined actions to `<AgentActionProvider registry={[...]}>` for single-roundtrip execution.
 *
 * @example
 * ```ts
 * export const updatePrice = defineAction({
 *   name: 'update_price',
 *   description: 'Update price markup on a property',
 *   parameters: z.object({ property_id: z.string(), markup: z.number() }),
 *   route: (p) => `/properties/${p.property_id}/pricing`,
 * });
 * ```
 */
export interface ActionDefinition<TParams = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  /** Zod schema for action parameters. */
  readonly parameters?: unknown;
  /** Client-side route to navigate to before executing. */
  readonly route?: (params: TParams) => string;
  /**
   * Static steps the agent walks through. Used when no component provides
   * runtime steps via `useAgentAction` or `<AgentAction>`.
   * Steps with `waitForMount: true` wait for the target to appear after
   * page transitions instead of using the default 3s poll.
   */
  readonly steps?: StepDefinition[];
  /**
   * How long (ms) to wait for this action's component to mount after navigation.
   * Also used as the timeout for `waitForMount` steps. Defaults to 5000ms.
   */
  readonly mountTimeout?: number;
}

export function defineAction<TParams = Record<string, unknown>>(config: {
  name: string;
  description: string;
  parameters?: unknown;
  route?: (params: TParams) => string;
  steps?: StepDefinition[];
  mountTimeout?: number;
}): ActionDefinition<TParams> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    route: config.route,
    steps: config.steps,
    mountTimeout: config.mountTimeout,
  };
}
