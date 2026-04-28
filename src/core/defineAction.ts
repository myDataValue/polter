import type { z } from 'zod';
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
export interface ActionDefinition<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>> {
  readonly name: string;
  readonly description: string;
  /** Zod schema for action parameters. */
  readonly parameters?: TSchema;
  /** Client-side route to navigate to before executing. */
  readonly route?: (params: z.infer<TSchema>) => string;
  /**
   * Static steps the agent walks through. Used when no component provides
   * runtime steps via `useAgentAction` or `<AgentAction>`.
   */
  readonly steps?: StepDefinition<z.infer<TSchema>>[];
}

export function defineAction<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>>(config: {
  name: string;
  description: string;
  parameters?: TSchema;
  route?: (params: z.infer<TSchema>) => string;
  steps?: StepDefinition<z.infer<TSchema>>[];
}): ActionDefinition<TSchema> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    route: config.route,
    steps: config.steps,
  };
}
