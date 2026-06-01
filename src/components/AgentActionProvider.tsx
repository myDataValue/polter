import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionSchema,
  AgentActionContextValue,
  AgentActionProviderProps,
  AgentTargetEntry,
  AvailableAction,
  ExecutionResult,
  RegisteredAction,
  ResolveDiagnostics,
  ResolveResult,
  StepDefinition,
} from '../core/types';
import { generateToolSchemas } from '../core/schemaGenerator';
import { createDebugLogger, findCandidateTargetNames } from '../core/debugLog';
import { executeAction } from '../executor/visualExecutor';

export const AgentActionContext = createContext<AgentActionContextValue | null>(null);

function schemaToRegisteredAction(def: ActionSchema<any>): RegisteredAction {
  return {
    ...def,
    resolveSteps: () => (def.steps as any[]) ?? [],
  };
}

export function AgentActionProvider({
  mode = 'guided',
  stepDelay = 600,
  overlayOpacity = 0.5,
  spotlightPadding = 8,
  tooltipEnabled = true,
  cursorEnabled = true,
  mountTimeout = 15000,
  children,
  onExecutionStart,
  onExecutionComplete,
  registry,
  debug = false,
}: AgentActionProviderProps) {
  // Held in a ref so the stable (deps: []) resolveTarget closure always reads
  // the current flag without being re-created.
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const actionsRef = useRef<Map<string, RegisteredAction>>(new Map());
  const targetsRef = useRef<Map<string, AgentTargetEntry>>(new Map());
  /** Registry actions stored separately so they can be restored on component unmount. */
  const registryRef = useRef<Map<string, RegisteredAction>>(new Map());
  const [version, setVersion] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const currentExecutionRef = useRef<AbortController | null>(null);

  // Sync registry prop into actionsRef on mount and when registry changes.
  useEffect(() => {
    const newNames = new Set<string>();

    for (const def of registry ?? []) {
      newNames.add(def.name);
      const registryAction = schemaToRegisteredAction(def);
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
    const action = registryAction && !incoming.navigateTo
      ? { ...incoming, navigateTo: registryAction.navigateTo }
      : incoming;

    if (debug && registryRef.current.size > 0 && !registryAction) {
      console.warn(
        `[polter] Action "${action.name}" is registered but missing from the registry. ` +
        `Add a defineAction() export to an actions.ts file so it appears in the tool schema before mount.`,
      );
    }

    // Antipattern: defineAction has steps AND useAgentAction supplies its own
    // steps. Either keep all steps in defineAction (preferred for cross-page)
    // or remove them from defineAction (same-page action). Splitting causes
    // racy two-phase execution where the component's steps may silently drop.
    if (debug && registryAction) {
      const registrySteps = registryAction.resolveSteps();
      const incomingSteps = action.resolveSteps();
      if (registrySteps.length > 0 && incomingSteps.length > 0) {
        console.warn(
          `[polter] Action "${action.name}" has steps in both defineAction and useAgentAction. ` +
          `Pick one — either remove the steps from useAgentAction (just pass runtime state like ` +
          `waitFor/disabledReason), or remove them from defineAction. See best-practices.md "Put cross-page steps in defineAction".`,
        );
      }
    }

    actionsRef.current.set(action.name, action);

    // Only bump version if schema-relevant or state-relevant props changed
    if (
      !existing ||
      existing.description !== action.description ||
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
      name: string,
      signal?: AbortSignal,
      params?: Record<string, unknown>,
      timeout = 5000,
      skipCheck?: () => boolean,
    ): Promise<ResolveResult> => {
      const pollInterval = 50;
      const start = performance.now();
      const log = createDebugLogger(debugRef.current);
      // Disabled targets are the explicit loading signal. Let those extend
      // past the base timeout, but still cap them so a permanently disabled
      // target cannot hang an action forever.
      // `hardCap = timeout + LOADING_EXTENSION_MS` so the extension is
      // always the same delta past the caller's base timeout, regardless
      // of how large that base is. (Earlier `Math.max(timeout, …)` form
      // collapsed for large timeouts and silently disabled the extension.)
      const LOADING_EXTENSION_MS = 25000;
      const hardCap = timeout + LOADING_EXTENSION_MS;
      let seenDisabled = false;
      let disabledMissingPolls = 0;
      let componentMounted = false;
      let polls = 0;

      // Snapshot the registry state into a diagnostics record. matchCount === 0
      // means nothing with this name is mounted; `candidates` lists mounted
      // targets sharing the name's prefix (surfaces ID mismatches / typos).
      const diag = (reason: ResolveDiagnostics['reason']): ResolveDiagnostics => {
        let matchCount = 0;
        const names: string[] = [];
        for (const entry of targetsRef.current.values()) {
          if (entry.name === name) matchCount++;
          if (entry.name) names.push(entry.name);
        }
        const candidates = matchCount === 0 ? findCandidateTargetNames(names, name) : [];
        return {
          reason,
          matchCount,
          componentMounted,
          seenDisabled,
          elapsedMs: performance.now() - start,
          candidates: candidates.length ? candidates : undefined,
        };
      };
      const miss = (reason: ResolveDiagnostics['reason']): ResolveResult => {
        const diagnostics = diag(reason);
        log('resolveTarget:miss', { actionName, name, ...diagnostics });
        return { element: null, diagnostics };
      };

      log('resolveTarget:start', { actionName, name, timeout });

      // Poll until the target appears and is enabled.
      // - If a disabled DOM match is found → poll up to hardCap (loading).
      // - If the action has disabledReason → abort immediately.
      // - Otherwise give up after the base timeout. Component mount is
      //   diagnostic only; it is not a loading signal because PRO-184 showed
      //   component-backed actions can be mounted while their target will never
      //   render.
      while (performance.now() - start < hardCap) {
        if (signal?.aborted) return miss('aborted');
        if (skipCheck?.()) return miss('skipped');

        const currentAction = actionsRef.current.get(actionName);
        const isComponentBacked = currentAction && currentAction !== registryRef.current.get(actionName);

        // Action became disabled (component determined it can't proceed).
        if (currentAction?.disabledReason) {
          throw new Error(currentAction.disabledReason);
        }

        if (isComponentBacked) componentMounted = true;

        // Scan registered targets before deciding whether to exit on component
        // unmount. Action and target unregister effects can run in separate
        // ticks, and a still-connected target is usable if it is present.
        let foundTarget = false;
        for (const entry of targetsRef.current.values()) {
          if (entry.name === name && entry.element.isConnected) {
            foundTarget = true;
            if ((entry.element as HTMLButtonElement).disabled) {
              seenDisabled = true;
            } else {
              log('resolveTarget:found', { actionName, name, elapsedMs: performance.now() - start });
              return { element: entry.element, diagnostics: diag('found') };
            }
          }
        }

        // Action's component was mounted at some point but then unregistered —
        // user navigated away mid-execution. Don't keep polling.
        if (componentMounted && !isComponentBacked) break;

        // We saw a disabled match earlier and now it's gone entirely — the
        // component may be swapping disabled → enabled across commits. Tolerate
        // a few missing polls before concluding it removed the target.
        if (seenDisabled && !foundTarget) {
          disabledMissingPolls++;
          if (disabledMissingPolls >= 3) break;
        } else {
          disabledMissingPolls = 0;
        }

        // Past the base timeout: keep going only when we see the loading-
        // pattern signal. Otherwise give up so PRO-184-style hangs surface
        // as a useful diagnostic.
        if (performance.now() - start >= timeout && !seenDisabled) break;

        // Live-watch heartbeat (~1s). matchCount 0 + componentMounted true keeps
        // reporting useful context until resolveTarget gives up.
        if (polls % 20 === 0) log('resolveTarget:waiting', { actionName, name, ...diag('timeout') });
        polls++;

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      // Yield once to let React effects propagate (disabledReason registration
      // runs after the DOM commit that removed targets).
      await new Promise((r) => setTimeout(r, pollInterval));
      const postAction = actionsRef.current.get(actionName);
      if (postAction?.disabledReason) {
        throw new Error(postAction.disabledReason);
      }

      return miss(componentMounted ? 'unmounted' : 'timeout');
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

  const execute = useCallback(
    async (actionName: string, params?: Record<string, unknown>): Promise<ExecutionResult> => {
      currentExecutionRef.current?.abort();
      const controller = new AbortController();
      currentExecutionRef.current = controller;
      const start = performance.now();

      let action = actionsRef.current.get(actionName);
      if (!action) {
        return { actionName, error: `Action "${actionName}" not found`, trace: [], durationMs: performance.now() - start };
      }
      if (action.disabledReason) {
        return {
          actionName,
          error: action.disabledReason,
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
          debug: debugRef.current,
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
            return { actionName, error, trace: [], durationMs: performance.now() - start };
          }
        }

        // Prepend navigateTo as synthetic steps so the cursor and spotlight
        // animate the cross-page click sequence the same way as in-page steps.
        // Without this, navigateTo would do silent el.click() calls and the
        // page would appear to teleport — defeating ADUI's "every interaction
        // visible" promise.
        //
        // Skip any target whose element is already marked as the current page
        // (`aria-current="page"`). Clicking a nav link to the page you're on
        // just animates pointlessly.
        const nav = action.navigateTo;
        const rawNavTargets = nav ? (Array.isArray(nav) ? nav : [nav]) : [];
        const navTargets = rawNavTargets.filter((name) => {
          for (const entry of targetsRef.current.values()) {
            if (entry.name === name && entry.element.isConnected) {
              return entry.element.getAttribute('aria-current') !== 'page';
            }
          }
          return true;
        });
        const actionWithNav: RegisteredAction = navTargets.length > 0
          ? {
              ...action,
              resolveSteps: () => [
                ...navTargets.map((target): StepDefinition => ({ label: target, target })),
                ...action.resolveSteps(),
              ],
            }
          : action;

        let result = await executeAction(actionWithNav, params ?? {}, executorConfig);

        // Prefer the component's disabledReason (e.g. "User must log in") over
        // the raw step-level error (e.g. "target not found for step X"). Skip
        // when the run was aborted — the executor's cancellation result must
        // survive so callers can tell user-initiated abort apart from a
        // disabled action.
        if (result.error && !controller.signal.aborted) {
          const currentAction = actionsRef.current.get(actionName);
          if (currentAction?.disabledReason) {
            result = { ...result, error: currentAction.disabledReason };
          }
        }

        // After navigation, the destination page's component may mount and
        // supply this action's real steps — the registry version is only a
        // schema stand-in for cross-page actions. Wait for that handoff, then
        // run phase 2.
        const isRegistryOnly = action === registryRef.current.get(actionName);
        if (!result.error && isRegistryOnly) {
          // Only a navigation mounts a *new* page, so only then is a slow mount
          // expected — give it the full mountTimeout (a heavy page can take
          // several seconds). With no navigation nothing new is coming, so keep
          // the wait short to stay responsive.
          const navigated = navTargets.length > 0;
          const upgraded = await waitForActionMount(
            actionName,
            controller.signal,
            navigated ? mountTimeout : 5000,
          );
          if (upgraded && upgraded !== registryRef.current.get(actionName)) {
            if (upgraded.disabledReason) {
              result = {
                actionName,
                error: upgraded.disabledReason,
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
          } else if (navigated && action.resolveSteps().length === 0 && !controller.signal.aborted) {
            // We navigated, but the destination component never mounted in time,
            // so this cross-page action's real steps never ran. Report the
            // failure instead of a bare-navigation "success" — otherwise the
            // agent narrates a result (e.g. an opened panel) that never happened.
            result = {
              actionName,
              error:
                `Navigated for "${actionName}" but the page did not finish loading in time, ` +
                `so the action did not complete. Ask the user to retry.`,
              trace: result.trace,
              durationMs: performance.now() - start,
            };
          }
        }

        // Override durationMs with total end-to-end time from provider
        result = { ...result, durationMs: performance.now() - start };
        onExecutionComplete?.(result);
        return result;
      } catch (err) {
        // User-initiated aborts take precedence over disabledReason so callers
        // can distinguish cancellation from a disabled action. Otherwise prefer
        // the component's disabledReason over the raw step-level error.
        const currentAction = actionsRef.current.get(actionName);
        const result: ExecutionResult = {
          actionName,
          error: controller.signal.aborted
            ? 'Execution cancelled'
            : (currentAction?.disabledReason ?? String(err)),
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
    [mode, stepDelay, overlayOpacity, spotlightPadding, tooltipEnabled, cursorEnabled, mountTimeout, onExecutionStart, onExecutionComplete, resolveTarget, waitForActionMount],
  );

  const availableActions = useMemo<AvailableAction[]>(
    () =>
      Array.from(actionsRef.current.values()).map((a) => ({
        name: a.name,
        description: a.description,
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
