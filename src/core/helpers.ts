import type { z } from 'zod';
import type { ActionSchema } from './types';

/**
 * Define an action schema for the registry.
 *
 * Cross-page actions should include `steps` here so the agent shows
 * the full UI walkthrough even before the target component mounts.
 * Components extend with runtime state (`waitFor`, `disabledReason`)
 * via `useAgentAction({ ...schema, waitFor, disabledReason })`.
 *
 * Same-page actions (target component is always mounted) can define
 * steps in the component instead.
 *
 * `navigateTo` accepts AgentTarget names or registered navigation actions with
 * static steps. URL-based navigation is not supported. If a page isn't
 * reachable by visible clicks, it isn't reachable by ADUI either.
 *
 * @example
 * ```ts
 * // actions.ts — cross-page action with steps
 * export const grantAccess = defineAction({
 *   name: 'grant_access',
 *   description: 'Grant bot access',
 *   navigateTo: 'connections-tab',
 *   steps: [
 *     { label: 'Select all', target: 'select-all' },
 *     { label: 'Grant', target: 'grant-btn' },
 *   ],
 * });
 *
 * // Component — runtime state only
 * useAgentAction({ ...grantAccess, waitFor: ref, disabledReason });
 * ```
 */
export function defineAction<TSchema extends z.ZodType = z.ZodType<Record<string, unknown>>>(
  config: ActionSchema<TSchema>,
): ActionSchema<TSchema> {
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
