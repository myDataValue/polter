import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionDefinition,
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

function definitionToRegisteredAction({ waitFor: _, ...def }: ActionDefinition<any>): RegisteredAction {
  return {
    ...def,
    disabled: false,
    resolveSteps: () => def.steps ?? [],
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
      if (!existing || existing.resolveSteps().length === 0) {
        actionsRef.current.set(def.name, registryAction);
      }
    }

    // Remove actions that were in the previous registry but not the new one.
    for (const name of registryRef.current.keys()) {
      if (!newNames.has(name)) {
        registryRef.current.delete(name);
        // Only remove from actionsRef if it's still the registry version (no component override).
        const current = actionsRef.current.get(name);
        if (current && current.resolveSteps().length === 0) {
          actionsRef.current.delete(name);
        }
      }
    }

    setVersion((v) => v + 1);
  }, [registry]);

  const registerAction = useCallback((incoming: RegisteredAction) => {
    const existing = actionsRef.current.get(incoming.name);

    const registryAction = registryRef.current.get(incoming.name);
    const action = registryAction && !incoming.route
      ? { ...incoming, route: registryAction.route }
      : incoming;

    if (devWarnings && registryRef.current.size > 0 && !registryAction) {
      console.warn(
        `[polter] Action "${action.name}" is registered but missing from the registry. ` +
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

  // Track target names that have been registered at least once — used to detect
  // conditional rendering (target mounted then unmounted instead of disabled).
  const seenTargetNamesRef = useRef<Set<string>>(new Set());

  const registerTarget = useCallback((id: string, entry: AgentTargetEntry) => {
    targetsRef.current.set(id, entry);
    if (entry.name) seenTargetNamesRef.current.add(entry.name);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const resolveTarget = useCallback(
    async (
      actionName: string,
      name: string,
      signal?: AbortSignal,
      params?: Record<string, unknown>,
      timeout = 5000,
    ): Promise<HTMLElement | null> => {
      const pollInterval = 50;
      const start = Date.now();
      let seenDisabled = false;

      // Poll until the target appears and is enabled.
      // If a disabled match is found, the element is loading — poll indefinitely.
      // If no match at all, give up after timeout.
      while (seenDisabled || Date.now() - start < timeout) {
        if (signal?.aborted) return null;

        for (const entry of targetsRef.current.values()) {
          if (entry.name === name && entry.element.isConnected) {
            if ((entry.element as HTMLButtonElement).disabled) {
              seenDisabled = true;
            } else {
              if (entry.scrollTo && params) {
                await entry.scrollTo(params);
              }
              return entry.element;
            }
          }
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      // If the target was previously registered but is now gone, the component
      // conditionally unmounted it (e.g. early return during loading). Throw a
      // clear error so the developer renders the target with disabled instead.
      if (seenTargetNamesRef.current.has(name)) {
        throw new Error(
          `[polter] AgentTarget "${name}" was previously mounted but is now gone. ` +
          `This usually means the component conditionally unmounts it during loading. ` +
          `Render the target with disabled={isLoading} instead of unmounting it.`,
        );
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
        if (current && current !== registryRef.current.get(name)) {
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
      const start = performance.now();

      let action = actionsRef.current.get(actionName);
      if (!action) {
        return { success: false, actionName, error: `Action "${actionName}" not found`, trace: [], durationMs: performance.now() - start };
      }
      if (action.disabled) {
        return {
          success: false,
          actionName,
          error: action.disabledReason || 'Action is disabled',
          trace: [],
          durationMs: performance.now() - start,
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
          mountTimeout: 5000,
          resolveTarget,
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
            return { success: false, actionName, error, trace: [], durationMs: performance.now() - start };
          }
        }

        // If this is a registry action with no DOM targets, navigate first.
        const targets = action.resolveSteps();
        if (targets.length === 0 && action.route && navigateRef.current) {
          await navigateToRoute(action, params);

          // Wait for the <AgentAction> component to mount on the new page.
          const mounted = await waitForActionMount(actionName, controller.signal, 5000);
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
            trace: [],
            durationMs: performance.now() - start,
          };
          onExecutionComplete?.(result);
          return result;
        }

        let result = await executeAction(action, params ?? {}, executorConfig);

        // After registry steps complete (e.g. navigation), the component may
        // have mounted and provided its own steps. If so, continue with those.
        const isRegistryOnly = action === registryRef.current.get(actionName);
        if (result.success && isRegistryOnly) {
          const upgraded = await waitForActionMount(actionName, controller.signal, 5000);
          if (upgraded && upgraded !== registryRef.current.get(actionName)) {
            // Re-check disabled — the mounted version may have dynamic state.
            if (upgraded.disabled) {
              result = {
                success: false,
                actionName,
                error: upgraded.disabledReason || 'Action is disabled',
                trace: result.trace,
                durationMs: performance.now() - start,
              };
            } else {
              const phase2 = await executeAction(upgraded, params ?? {}, executorConfig);
              result = {
                ...phase2,
                trace: [...result.trace, ...phase2.trace],
                durationMs: performance.now() - start,
              };
            }
          }
        }

        // Override durationMs with total end-to-end time from provider
        result = { ...result, durationMs: performance.now() - start };
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
          trace: [],
          durationMs: performance.now() - start,
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
    [mode, stepDelay, overlayOpacity, spotlightPadding, tooltipEnabled, cursorEnabled, onExecutionStart, onExecutionComplete, resolveTarget, waitForActionMount, navigateToRoute],
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

  const abortExecution = useCallback(() => {
    if (currentExecutionRef.current) {
      currentExecutionRef.current.abort();
      currentExecutionRef.current = null;
    }
  }, []);

  const contextValue = useMemo<AgentActionContextValue>(
    () => ({
      registerAction,
      unregisterAction,
      registerTarget,
      unregisterTarget,
      execute,
      abortExecution,
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
      abortExecution,
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
