import type { z } from 'zod';
import type { ActionDefinition } from './defineAction';
import type { AgentActionConfig } from '../hooks/useAgentAction';

/**
 * Type-safe action config constructor. Infers the Zod schema from the
 * action definition so step callbacks get typed params.
 *
 * @example
 * useAgentAction(
 *   action(editMarkup, {
 *     steps: [{ label: 'Set', target: 'input', value: fromParam('markup') }],
 *   }),
 * );
 */
export function action<TSchema extends z.ZodType>(
  actionDef: ActionDefinition<TSchema>,
  config: Omit<AgentActionConfig<TSchema>, 'action'> = {},
): AgentActionConfig<TSchema> {
  return { action: actionDef, ...config };
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
