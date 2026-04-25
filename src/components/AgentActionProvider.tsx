import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentActionContextValue,
  AgentActionProviderProps,
  AgentTargetEntry,
  AvailableAction,
  ExecutionResult,
  RegisteredAction,
} from '../core/types';
import type { ActionDefinition } from '../core/defineAction';
import { generateToolSchemas } from '../core/schemaGenerator';
import { executeAction } from '../executor/visualExecutor';

export const AgentActionContext = createContext<AgentActionContextValue | null>(null);

/** Convert an ActionDefinition to a schema-only RegisteredAction (no DOM targets). */
function definitionToRegisteredAction(def: ActionDefinition<any>): RegisteredAction {
  return {
    name: def.name,
    description: def.description,
    parameters: def.parameters,
    disabled: false,
    disabledReason: undefined,
    // Use defineAction steps as fallback when no component provides runtime steps.
    getExecutionTargets: () =>
      def.steps?.length ? def.steps.map((s) => ({ ...s, element: null })) : [],
    route: def.route as RegisteredAction['route'],
    mountTimeout: def.mountTimeout,
  };
}

export function AgentActionProvider({
  mode = 'guided',
  stepDelay = 600,
  overlayOpacity = 0.5,
  spotlightPadding = 8,
  tooltipEnabled = true,
  cursorEnabled = true,
  children,
  onExecutionStart,
  onExecutionComplete,
  registry,
  navigate,
  devWarnings = false,
}: AgentActionProviderProps) {
  const actionsRef = useRef<Map<string, RegisteredAction>>(new Map());
  const targetsRef = useRef<Map<string, AgentTargetEntry>>(new Map());
  /** Registry actions stored separately so they can be restored on component unmount. */
  const registryRef = useRef<Map<string, RegisteredAction>>(new Map());
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [version, setVersion] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const currentExecutionRef = useRef<AbortController | null>(null);

  // Sync registry prop into actionsRef on mount and when registry changes.
  useEffect(() => {
    const newNames = new Set<string>();

    for (const def of registry ?? []) {
      newNames.add(def.name);
      const registryAction = definitionToRegisteredAction(def);
      registryRef.current.set(def.name, registryAction);

      // Only set in actionsRef if no component has already registered a richer version
      // (a component-backed action has DOM targets).
      const existing = actionsRef.current.get(def.name);
      if (!existing || existing.getExecutionTargets().length === 0) {
        actionsRef.current.set(def.name, registryAction);
      }
    }

    // Remove actions that were in the previous registry but not the new one.
    for (const name of registryRef.current.keys()) {
      if (!newNames.has(name)) {
        registryRef.current.delete(name);
        // Only remove from actionsRef if it's still the registry version (no component override).
        const current = actionsRef.current.get(name);
        if (current && current.getExecutionTargets().length === 0) {
          actionsRef.current.delete(name);
        }
      }
    }

    setVersion((v) => v + 1);
  }, [registry]);

  const registerAction = useCallback((action: RegisteredAction) => {
    const existing = actionsRef.current.get(action.name);

    // Preserve route/mountTimeout from registry definition when a component upgrades the action.
    const registryAction = registryRef.current.get(action.name);
    if (registryAction) {
      if (!action.route) action.route = registryAction.route;
      if (action.mountTimeout == null) action.mountTimeout = registryAction.mountTimeout;
    }

    // Dev-mode warning: action registered by component but not in registry
    if (devWarnings && !registryAction && action.componentBacked) {
      console.warn(
        `[polter] Action "${action.name}" is registered by a component but missing from the registry. ` +
        `Add a defineAction() export to an actions.ts file so it appears in the tool schema before mount.`,
      );
    }

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
    // If this action came from the registry, restore the schema-only version
    // instead of deleting so the LLM still sees it in schemas.
    const registryAction = registryRef.current.get(name);
    if (registryAction) {
      actionsRef.current.set(name, registryAction);
    } else {
      actionsRef.current.delete(name);
    }
    setVersion((v) => v + 1);
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
      timeout = 3000,
    ): Promise<HTMLElement | null> => {
      const normalizedValue = value.toLowerCase();
      const pollInterval = 50;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        if (signal?.aborted) return null;

        for (const entry of targetsRef.current.values()) {
          if (
            (!entry.action || entry.action === actionName) &&
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
      params?: Record<string, unknown>,
      timeout = 3000,
    ): Promise<HTMLElement | null> => {
      const pollInterval = 50;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        if (signal?.aborted) return null;

        for (const entry of targetsRef.current.values()) {
          if (
            (!entry.action || entry.action === actionName) &&
            entry.name === name &&
            entry.element.isConnected
          ) {
            if (entry.prepareView && params) {
              await entry.prepareView(params);
            }
            return entry.element;
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      return null;
    },
    [],
  );

  /** Poll actionsRef until the action has DOM targets (component mounted after navigation). */
  const waitForActionMount = useCallback(
    async (name: string, signal?: AbortSignal, timeout = 5000): Promise<RegisteredAction | null> => {
      const maxWait = timeout;
      const pollInterval = 50;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (signal?.aborted) return null;
        const current = actionsRef.current.get(name);
        if (current && (current.componentBacked || current.getExecutionTargets().length > 0)) {
          return current;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      // Timed out — return whatever we have (executor handles empty targets gracefully).
      return actionsRef.current.get(name) ?? null;
    },
    [],
  );

  const navigateToRoute = useCallback(
    async (action: RegisteredAction, routeParams?: Record<string, unknown>) => {
      const path = action.route!(routeParams ?? {});
      await navigateRef.current!(path);
    },
    [],
  );

  const execute = useCallback(
    async (actionName: string, params?: Record<string, unknown>): Promise<ExecutionResult> => {
      currentExecutionRef.current?.abort();
      const controller = new AbortController();
      currentExecutionRef.current = controller;

      let action = actionsRef.current.get(actionName);
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
        const executorConfig = {
          mode,
          stepDelay,
          overlayOpacity,
          spotlightPadding,
          tooltipEnabled,
          cursorEnabled,
          signal: controller.signal,
          mountTimeout: action.mountTimeout ?? 5000,
          resolveTarget,
          resolveNamedTarget,
        };

        // Validate params against the Zod schema before executing.
        const schema = action.parameters as any;
        if (schema?.safeParse) {
          const validation = schema.safeParse(params ?? {});
          if (!validation.success) {
            const missing = validation.error.issues
              .map((i: any) => i.path.join('.'))
              .filter(Boolean);
            const error = missing.length > 0
              ? `Required parameters missing: ${missing.join(', ')}`
              : validation.error.issues.map((i: any) => i.message).join('; ');
            return { success: false, actionName, error };
          }
        }

        // If this is a registry action with no DOM targets, navigate first.
        const targets = action.getExecutionTargets();
        if (targets.length === 0 && action.route && navigateRef.current) {
          await navigateToRoute(action, params);

          // Wait for the <AgentAction> component to mount on the new page.
          const mounted = await waitForActionMount(actionName, controller.signal, action.mountTimeout);
          if (mounted) {
            action = mounted;
          }
        }

        // Re-check disabled after navigation — the mounted version may have
        // dynamic disabled state that the schema-only registry version didn't.
        if (action.disabled) {
          const result: ExecutionResult = {
            success: false,
            actionName,
            error: action.disabledReason || 'Action is disabled',
          };
          onExecutionComplete?.(result);
          return result;
        }

        const result = await executeAction(action, params ?? {}, executorConfig);
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
    [mode, stepDelay, overlayOpacity, spotlightPadding, tooltipEnabled, cursorEnabled, onExecutionStart, onExecutionComplete, resolveTarget, resolveNamedTarget, waitForActionMount, navigateToRoute],
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
