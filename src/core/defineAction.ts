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
   * Chain of action names to execute sequentially before this action.
   * Each action in the chain is visually executed (spotlight → click), and the next
   * action is waited on to mount before proceeding. This lets the user see the full
   * navigation path instead of being teleported directly to a route.
   */
  readonly navigateVia?: string[];
  /**
   * How long (ms) to wait for this action's component to mount after navigation.
   * Defaults to 5000ms. Set higher for pages that load slowly
   */
  readonly mountTimeout?: number;
}

export function defineAction<TParams = Record<string, unknown>>(config: {
  name: string;
  description: string;
  parameters?: unknown;
  route?: (params: TParams) => string;
  navigateVia?: string[];
  mountTimeout?: number;
}): ActionDefinition<TParams> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    route: config.route,
    navigateVia: config.navigateVia,
    mountTimeout: config.mountTimeout,
  };
}
