import { useCallback } from 'react';
import { useAgentActions } from './useAgentActions';

/**
 * Wraps an existing command handler with agent action routing.
 *
 * When a command arrives, if a matching `<AgentAction>` is mounted and enabled,
 * it routes through `execute()` for visual guided execution. Otherwise it falls
 * through to the original handler.
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
): (command: T) => Promise<void> {
  const { execute, availableActions } = useAgentActions();

  return useCallback(
    async (command: T) => {
      const actionName = getActionName(command);
      const isRegistered = availableActions.some((a) => a.name === actionName && !a.disabled);

      if (isRegistered) {
        await execute(actionName, command as Record<string, unknown>);
        return;
      }

      await fallback?.(command);
    },
    [execute, availableActions, fallback, getActionName],
  );
}
