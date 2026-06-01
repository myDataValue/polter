/**
 * Uniform, prefix-consistent debug logging for polter execution.
 *
 * Every important step emits `[polter] <event> {…}` so a developer can filter
 * the console on `[polter]`, copy the lot, and paste it into an LLM to get an
 * immediate read on what happened. Gated by the provider's `debug` prop, so it
 * is silent unless explicitly enabled (on in dev, opt-in via localStorage in
 * prod — see AgentActionProvider usage).
 *
 * The structured `ResolveDiagnostics` carried on each step trace is the durable
 * record ("Copy debug" exports it); these console events are the live-watch
 * companion.
 */
export type DebugLogger = (event: string, payload?: Record<string, unknown>) => void;

export function createDebugLogger(enabled: boolean): DebugLogger {
  if (!enabled) return () => {};
  return (event, payload) => {
    // eslint-disable-next-line no-console -- intentional, gated behind `debug`
    console.log(`[polter] ${event}`, payload ?? {});
  };
}

/**
 * Mounted target names that share the requested name's prefix (everything up to
 * and including the final `-`). When the exact target isn't mounted, these are
 * the likely intended ones — surfacing ID mismatches (e.g. a truncated
 * `edit_airbnb_pms_markup-46078439` vs the real long listing IDs) and typos.
 *
 * Pure so it can be unit-tested without a DOM or registry.
 */
export function findCandidateTargetNames(
  registeredNames: readonly string[],
  wanted: string,
  limit = 8,
): string[] {
  const sep = wanted.lastIndexOf('-');
  if (sep < 0) return [];
  const prefix = wanted.slice(0, sep + 1);
  const out: string[] = [];
  for (const name of registeredNames) {
    if (name !== wanted && name.startsWith(prefix)) {
      out.push(name);
      if (out.length >= limit) break;
    }
  }
  return out;
}
