import type { z } from 'zod';
import type { ActionDefinition } from './types';

/**
 * Create a typed action definition. Infers `TSchema` from the `parameters`
 * Zod schema so that `steps`, `route`, and `skipIf`/`value`/`target`
 * callbacks all receive typed params.
 *
 * Call at import time for the registry (schema only), then spread into
 * a second `defineAction` at render time to add steps:
 *
 * @example
 * ```ts
 * // actions.ts — schema for the registry
 * export const editMarkup = defineAction({
 *   name: 'edit_markup',
 *   description: 'Edit markup',
 *   parameters: z.object({ property_id: z.number(), markup: z.number() }),
 * });
 *
 * // Component — add steps with typed params
 * useAgentAction(
 *   defineAction({ ...editMarkup, steps: [
 *     { label: 'Set value', target: 'input', value: fromParam('markup') },
 *   ]}),
 * );
 * ```
 */
export function defineAction<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>>(
  config: ActionDefinition<TSchema>,
): ActionDefinition<TSchema> {
  return config;
}

/**
 * Produces a `value` function that extracts a named param.
 *
 * @example
 * { label: 'Type name', value: fromParam('name'), target: 'search' }
 */
export function fromParam(
  paramName: string,
): (params: Record<string, unknown>) => string | undefined {
  return (params) => {
    if (!Object.prototype.hasOwnProperty.call(params, paramName)) return undefined;
    return String(params[paramName]);
  };
}
