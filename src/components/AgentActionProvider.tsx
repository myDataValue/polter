import React, { createContext, useCallback, useMemo, useRef, useState } from 'react';
import type {
  AgentActionContextValue,
  AgentActionProviderProps,
  AgentTargetEntry,
  AvailableAction,
  ExecutionResult,
  RegisteredAction,
} from '../core/types';
import { generateToolSchemas } from '../core/schemaGenerator';
import { executeAction } from '../executor/visualExecutor';

export const AgentActionContext = createContext<AgentActionContextValue | null>(null);

export function AgentActionProvider({
  mode = 'guided',
  stepDelay = 600,
  overlayOpacity = 0.5,
  spotlightPadding = 8,
  tooltipEnabled = true,
  children,
  onExecutionStart,
  onExecutionComplete,
}: AgentActionProviderProps) {
  const actionsRef = useRef<Map<string, RegisteredAction>>(new Map());
  const targetsRef = useRef<Map<string, AgentTargetEntry>>(new Map());
  const [version, setVersion] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const currentExecutionRef = useRef<AbortController | null>(null);

  const registerAction = useCallback((action: RegisteredAction) => {
    const existing = actionsRef.current.get(action.name);
    actionsRef.current.set(action.name, action);

    // Only bump version if schema-relevant or state-relevant props changed
    if (
      !existing ||
      existing.description !== action.description ||
      existing.disabled !== action.disabled ||
      existing.disabledReason !== action.disabledReason
    ) {
      setVersion((v) => v + 1);
    }
  }, []);

  const unregisterAction = useCallback((name: string) => {
    if (actionsRef.current.delete(name)) {
      setVersion((v) => v + 1);
    }
  }, []);

  const registerTarget = useCallback((id: string, entry: AgentTargetEntry) => {
    targetsRef.current.set(id, entry);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const resolveTarget = useCallback(
    async (
      actionName: string,
      param: string,
      value: string,
      signal?: AbortSignal,
    ): Promise<HTMLElement | null> => {
      const normalizedValue = value.toLowerCase();
      const maxWait = 3000;
      const pollInterval = 50;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (signal?.aborted) return null;

        for (const entry of targetsRef.current.values()) {
          if (
            entry.action === actionName &&
            entry.param === param &&
            entry.value?.toLowerCase() === normalizedValue &&
            entry.element.isConnected
          ) {
            return entry.element;
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      return null;
    },
    [],
  );

  const resolveNamedTarget = useCallback(
    async (
      actionName: string,
      name: string,
      signal?: AbortSignal,
    ): Promise<HTMLElement | null> => {
      const maxWait = 3000;
      const pollInterval = 50;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (signal?.aborted) return null;

        for (const entry of targetsRef.current.values()) {
          if (
            entry.action === actionName &&
            entry.name === name &&
            entry.element.isConnected
          ) {
            return entry.element;
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      return null;
    },
    [],
  );

  const execute = useCallback(
    async (actionName: string, params?: Record<string, unknown>): Promise<ExecutionResult> => {
      currentExecutionRef.current?.abort();
      const controller = new AbortController();
      currentExecutionRef.current = controller;

      const action = actionsRef.current.get(actionName);
      if (!action) {
        return { success: false, actionName, error: `Action "${actionName}" not found` };
      }
      if (action.disabled) {
        return {
          success: false,
          actionName,
          error: action.disabledReason || 'Action is disabled',
        };
      }

      setIsExecuting(true);
      onExecutionStart?.(actionName);

      try {
        const result = await executeAction(action, params ?? {}, {
          mode,
          stepDelay,
          overlayOpacity,
          spotlightPadding,
          tooltipEnabled,
          signal: controller.signal,
          resolveTarget,
          resolveNamedTarget,
        });
        onExecutionComplete?.(result);
        return result;
      } catch (err) {
        const result: ExecutionResult = {
          success: false,
          actionName,
          error:
            err instanceof DOMException && err.name === 'AbortError'
              ? 'Execution cancelled'
              : String(err),
        };
        onExecutionComplete?.(result);
        return result;
      } finally {
        setIsExecuting(false);
        if (currentExecutionRef.current === controller) {
          currentExecutionRef.current = null;
        }
      }
    },
    [mode, stepDelay, overlayOpacity, spotlightPadding, tooltipEnabled, onExecutionStart, onExecutionComplete, resolveTarget, resolveNamedTarget],
  );

  const availableActions = useMemo<AvailableAction[]>(
    () =>
      Array.from(actionsRef.current.values()).map((a) => ({
        name: a.name,
        description: a.description,
        disabled: a.disabled,
        disabledReason: a.disabledReason,
        hasParameters: !!a.parameters,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const schemas = useMemo(
    () => generateToolSchemas(Array.from(actionsRef.current.values())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const contextValue = useMemo<AgentActionContextValue>(
    () => ({
      registerAction,
      unregisterAction,
      registerTarget,
      unregisterTarget,
      execute,
      availableActions,
      schemas,
      isExecuting,
      mode,
    }),
    [
      registerAction,
      unregisterAction,
      registerTarget,
      unregisterTarget,
      execute,
      availableActions,
      schemas,
      isExecuting,
      mode,
    ],
  );

  return (
    <AgentActionContext.Provider value={contextValue}>{children}</AgentActionContext.Provider>
  );
}
