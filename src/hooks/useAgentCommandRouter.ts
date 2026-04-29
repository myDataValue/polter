import { useCallback } from 'react';
import type { ExecutionResult } from '../core/types';
import { useAgentActions } from './useAgentActions';

/**
 * Wraps an existing command handler with agent action routing.
 *
 * When a command arrives, if a matching `<AgentAction>` is mounted and enabled,
 * it routes through `execute()` for visual guided execution. Otherwise it falls
 * through to the original handler.
 *
 * Returns the `ExecutionResult` for registered actions, or `undefined` for
 * fallback commands.
 *
 * Works with any command shape — you provide `getActionName` to extract the
 * action name from your command object.
 *
 * @example
 * ```tsx
 * const handleCommand = useAgentCommandRouter(
 *   existingHandler,
 *   (cmd) => cmd.action,
 * );
 * ```
 */
export function useAgentCommandRouter<T>(
  fallback: ((command: T) => void | Promise<void>) | null,
  getActionName: (command: T) => string,
): (command: T) => Promise<ExecutionResult | undefined> {
  const { execute, availableActions } = useAgentActions();

  return useCallback(
    async (command: T): Promise<ExecutionResult | undefined> => {
      const actionName = getActionName(command);
      const match = availableActions.find((a) => a.name === actionName);

      if (match?.disabledReason) {
        return { actionName, error: match.disabledReason, trace: [], durationMs: 0 };
      }

      if (match) {
        return await execute(actionName, command as Record<string, unknown>);
      }

      await fallback?.(command);
      return undefined;
    },
    [execute, availableActions, fallback, getActionName],
  );
}
