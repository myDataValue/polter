import { useCallback, useContext, useEffect, useRef } from 'react';
import { AgentActionContext } from '../components/AgentActionProvider';
import type { ExecutionTarget } from '../core/types';

interface UseAgentActionOptions {
  name: string;
  description: string;
  parameters?: unknown;
  onExecute?: (params: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Register a programmatic agent action (no visual element).
 *
 * Use this for actions that don't need to spotlight a UI element —
 * navigation, data mutations, table manipulation, etc.
 * For actions that wrap a visible element, use `<AgentAction>` instead.
 *
 * @example
 * ```tsx
 * useAgentAction({
 *   name: "filter_by_tag",
 *   description: "Filter table by tag",
 *   parameters: z.object({ tag_name: z.string() }),
 *   onExecute: (p) => { setSelectedTagIds([findTag(p.tag_name).id]); },
 * });
 * ```
 */
export function useAgentAction({
  name,
  description,
  parameters,
  onExecute,
  disabled = false,
  disabledReason,
}: UseAgentActionOptions): void {
  const context = useContext(AgentActionContext);
  if (!context) {
    throw new Error('useAgentAction must be used within an AgentActionProvider');
  }

  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  const stableOnExecute = useCallback((params: Record<string, unknown>) => {
    return onExecuteRef.current?.(params);
  }, []);

  const getExecutionTargets = useCallback((): ExecutionTarget[] => [], []);

  const { registerAction, unregisterAction } = context;

  useEffect(() => {
    registerAction({
      name,
      description,
      parameters: parametersRef.current,
      onExecute: onExecuteRef.current ? stableOnExecute : undefined,
      disabled,
      disabledReason,
      getExecutionTargets,
    });
    return () => unregisterAction(name);
  }, [name, description, disabled, disabledReason, stableOnExecute, getExecutionTargets, registerAction, unregisterAction]);
}
