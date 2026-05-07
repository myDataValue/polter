# Polter architecture session — handoff

**Date:** 2026-05-07
**Branch:** `claude/evaluate-react-usage-xajfr` (already pushed to `myDataValue/polter`)
**Last commit:** `ebf5cb4` — `docs: add architecture working doc with React-coupling diagrams`
**Working tree:** clean
**Repo:** `/home/user/polter` in the session env; local equivalent presumably the same path or wherever you cloned `myDataValue/polter`

---

## TL;DR — where things stand

1. The session started as "does Polter need React?" and widened into a full architecture review covering 9 open design questions.
2. The deliverable is `docs/architecture.md` (396 lines, Mermaid diagrams + open questions). It's already pushed to the branch above. No PR opened — explicit ask.
3. No code changes. The architecture doc is a *substrate for triage*, not a plan of record.
4. Key conclusion: **lift the registry into a framework-neutral `createPolter()` factory, then add a `state({ test, achieve })` goal-tree primitive, then pick off additive items.**
5. The "hook deeper into React" path was considered and rejected.

---

## How to pick this up locally

```sh
git fetch origin claude/evaluate-react-usage-xajfr
git checkout claude/evaluate-react-usage-xajfr
# render docs/architecture.md in any Mermaid-aware viewer:
#   - GitHub renders inline at https://github.com/myDataValue/polter/blob/claude/evaluate-react-usage-xajfr/docs/architecture.md
#   - VS Code: Markdown Preview Mermaid Support extension
#   - Obsidian renders natively
```

If you continue with another Claude session locally, paste the "Quick continuation prompts" at the bottom of this file.

---

## What was delivered

### File: `docs/architecture.md`

Sections:
1. **Context** — why this doc exists
2. **Diagram tooling decision** — Mermaid primary, Graphviz/Excalidraw as escape hatches
3. **Current architecture** — 5 diagrams:
   - **1.** Layer overview, color-coded (cyan = React-coupled, blue = pure TS, yellow = external)
   - **1b.** What moves to `@polter/core` vs. stays in `@polter/react` if Phase 1 lift happens
   - **2.** Type relationships (classDiagram)
   - **3.** Registration lifecycle (sequenceDiagram)
   - **4.** Execute flow (sequenceDiagram, the gnarliest one)
   - **5.** `find_and_email` as the goal tree it implicitly is — best illustration of the `skipIf` pain
4. **Open questions Q1–Q9** with current state / leaning / implications for each
5. **Proposed direction** — 3-step ordering
6. **Critical files** — line-referenced table
7. **Verification** — how to validate any move

### Commit message used

```
docs: add architecture working doc with React-coupling diagrams

Maps current layers, types, registration lifecycle, and execute flow
in Mermaid. Highlights React-coupled vs. pure-TS surface, and tracks
nine open design questions (steps-as-goal-tree, action returns, type
safety, non-UI tools, React boundary, etc.) as a triage substrate.
```

### What was *not* done (intentional)

- No PR opened (you said wait)
- No code changes — `src/` and `examples/` untouched
- No tests run (no need; doc-only change)
- No `createPolter.ts` written — that's the Phase 1 implementation, separate piece of work

---

## The substantive conclusions (so you can pick up without re-rendering)

### Diagram 1 punchline (React coupling)

The React-coupled surface is small: `AgentActionProvider` + 3 components (`AgentAction`, `AgentTarget`, `AgentStep`) + 3 hooks (`useAgentAction`, `useAgentActions`, `useAgentCommandRouter`). Everything else — `core/`, `executor/`, registry data structures — is **already pure TS**. About 60/40 React-to-pure by line count, but the pure side contains all the *behavior*; the React side is mostly lifecycle wiring.

### Diagram 1b punchline (the lift)

If we extract `@polter/core`:
- **Stays in `@polter/react` adapter:** the Provider (now a thin shell), the 3 components, the 3 hooks, `AgentDevTools` (the only fat React-only piece — it's a UI itself).
- **Moves to `@polter/core`:** a new `createPolter()` factory, the registry + resolveTarget + resolveNamedTarget + waitForActionMount + execute orchestration (currently lives in `AgentActionProvider:45-399`), `visualExecutor`, `defineAction` + `schemaGenerator` + types, and the future `state()` primitive.

The adapter shape is small (8 thin shells, all just calling `polter.register*` in lifecycle hooks). A `@polter/vue` or `@polter/vanilla` would mirror it.

### Diagram 5 punchline (the `skipIf` pain)

`examples/basic/src/App.tsx:116-136` — the `find_and_email` action — is a 5-step linear list where each step carries a hand-written `skipIf` testing every prefix that might already be satisfied. The data is actually a goal tree: "send-email clicked" depends on "row visible" depends on "filter == all" depends on "dropdown open". Authoring it as a list flattens the tree and forces every node to re-derive its preconditions. This is the strongest motivation for Q1 (the goal-tree primitive).

### Why Mermaid

- Text in repo (diffs cleanly, evolves with code)
- Renders inline in GitHub, VS Code, Claude Code, doc sites
- Good enough for class/sequence/state/flow at this scale
- Escape hatches: Graphviz for >30-node dependency graphs, Excalidraw → PNG for marketing visuals where aesthetics matter (don't try to make Mermaid pretty)

---

## The 9 open questions, with current leanings

### Q1. Step dependencies — flat list vs. goal tree
**Today:** `steps: StepDefinition[]` with hand-written `skipIf`.
**Lean:** Lift to `state({ test, achieve })` primitive in `core/`. Authors compose states; executor walks tree depth-first with test-then-achieve. Authoring shape matches data shape (Diagram 5).
**Cost:** ~300 LOC new core primitive. Existing `steps[]` can lower onto it later.
**Priority:** HIGH — biggest current pain point.

### Q2. Steps vs. actions — do we need both?
**Lean:** Yes, keep both at different levels. Action = agent-callable; step = internal interaction. Polter's value is high-level operations, not WebArena-style click-by-click reasoning. In a goal-tree world, "step" becomes "leaf interaction".
**Cost:** Just type cleanup once Q1 lands.

### Q3. Should Polter expose structured UI state or hierarchies?
**Today:** Only `availableActions` exposed.
**Lean:** Lightweight middle path — let actions/steps optionally surface their *current value* (e.g., `currentSelection: 'Sarah Chen'`). Falls out for free if Q1 lands. Out of scope: full DOM/AX-tree dump (high token cost, requires opt-in).
**Cost:** New `getUIState()` API, schema augmentation.

### Q4. Should actions return values, not just on failure?
**Today:** `ExecutionResult { success, error, trace, durationMs }` — no payload.
**Lean:** Yes. Add `returns: ZodSchema` to `defineAction` + `getResult: () => T` callback. Natural for `find_customer`, `count_active`, etc. Backwards compatible.
**Cost:** Generic `ExecutionResult<T>`. Small.

### Q5. Async, abort, long-running actions
**Today:** `execute()` is async, awaits. AbortSignal exists. Most <1s.
**Lean:** For long-running, Claude-Code pattern: action returns handle immediately, LLM can call `wait_for_action(handle)` later. Mark with `longRunning: true`. Default behavior unchanged.
**Cost:** Two execute paths in executor + new synthetic tool. v2 feature.

### Q6. More type safety
**Today:** Steps' `fromParam: 'name'`, `setParam`, `skipIf` are loose strings/anys.
**Lean:** Yes. `StepDefinition<TParams>` with `fromParam: keyof TParams`. Pure TypeScript work, no runtime impact.
**Cost:** Should land in same PR as Q1.

### Q7. Auto-generate steps to navigate the UI tree
**Today:** Single-route nav via `defineAction.route`. Multi-step (route → tab → modal → form) hand-authored.
**Lean:** Falls out of Q1 + a route registry. "Reach state X" becomes a goal node; route/tab/modal-open are providers. Executor's depth-first walk handles it.
**Cost:** Q1 must land first. Then small route-registry helper.

### Q8. Non-UI tool calls
**Today:** Every action drives DOM. No plain-function tools.
**Lean:** Add `useTool({ name, parameters, run })`. Shares registry with `useAgentAction`, but execution skips executor entirely. Single schema list to LLM, two execution paths internally.
**Cost:** `kind: 'ui' | 'tool'` on `RegisteredAction`. Provider's `execute` branches. Small.

### Q9. Should the React coupling go away (or get deeper)?
**Today:** React is structural — registry/context live on Provider hooks. But the React layer is doing pedestrian work (managing a `Map`, bumping a `version` counter, providing context). Nothing exploits anything React-specific.
**Lean:** Lift to `createPolter()` factory (Phase 1). Provider becomes thin shell. Not user-visible. Whether to ship `@polter/vanilla`/`@polter/vue` is a separate marketing call — the boundary is worth having either way.
**Rejected:** Deeper React coupling (fiber traversal, react-reconciler hooks, displayName-based auto-detection). React internals aren't stable, wins are better delivered via build-time codemod, and the things we actually want come from Q1 not from fiber visibility.
**Cost:** Lift `AgentActionProvider:45-399` into `core/createPolter.ts`. Provider becomes ~50 LOC. `useSyncExternalStore` for subscriptions. Tests pass unchanged.

---

## Proposed direction (the 3-step ordering)

1. **Phase 1 — Lift registry to `createPolter()` factory** (Q9 / Diagram 1b). Provider becomes thin React shell. Not user-visible. ~1 PR.
2. **Phase 2 — Add `state({ test, achieve })` and goal-tree execution** to `core/` (Q1). Ships alongside `steps[]`. Solves the `skipIf` pain. Unlocks Q3 (state queries) and Q7 (auto-nav) for free.
3. **Phase 3 — Pick off additive items** in any order: type safety (Q6), action results (Q4), non-UI tools (Q8), long-running actions (Q5).

The framework-agnostic core path quietly happens as a side effect of Phase 1. Whether to ship `@polter/vue` becomes a marketing question, not architectural.

---

## Codebase reference (the parts that matter for these moves)

### Critical files (with what they do)

| File | LOC | Role | Touched by |
|---|---|---|---|
| `src/components/AgentActionProvider.tsx` | ~430 | Registry + context + execute orchestration. Lines 45-399 are the lift target. | Phase 1 |
| `src/executor/visualExecutor.ts` | ~568 | Step loop, element resolution, click/type/spotlight effects | Phase 2 (Q1) |
| `src/core/types.ts` | — | All shared types | Q4 / Q6 |
| `src/core/defineAction.ts` | — | Action factory | Q4 / Q8 |
| `src/components/AgentAction.tsx` | — | Wraps element + registers | minor for Q1 |
| `src/components/AgentTarget.tsx` | — | Target registration + MutationObserver | — |
| `src/hooks/useAgentAction.ts` | — | Hook-based registration | — |
| `examples/basic/src/App.tsx:116-136` | — | The `skipIf` pile | best Q1 case study |

### Tests

`src/__tests__/` — black-box against the public API. Should pass through Phase 1 unchanged. Any failing test = unintended public-API change.

`examples/basic` — integration test. Run `pnpm dev` from there and confirm `find_and_email` and `filter_and_export` still work end-to-end after any change.

---

## Things the agent did *not* verify firsthand

I should be honest about what I'm taking on faith from prior conversation context vs. having read myself:

- **Did read / referenced:** the architecture is described correctly per the prior planning conversation. The branch state is verified (`git status` clean, branch is `claude/evaluate-react-usage-xajfr`, commit `ebf5cb4` pushed).
- **Did NOT re-read in this session:** `AgentActionProvider.tsx` line ranges (cited 45-399 from prior context), `visualExecutor.ts` LOC (568 from prior context), `examples/basic/src/App.tsx:116-136` (the `skipIf` example — described from prior context).
- **Recommended before acting:** `Read` the files above firsthand. Numbers should be approximately right but verify before quoting them in a PR description.

---

## Decisions already made (don't relitigate unless you want to)

- ✅ Mermaid is the diagram tool. Graphviz / Excalidraw as escape hatches.
- ✅ Phase 1 (registry lift) is the right first move and is not user-visible.
- ✅ Goal-tree primitive (Q1) is the right second move.
- ✅ Deeper React coupling (fiber traversal etc.) is rejected.
- ✅ Architecture doc lives at `docs/architecture.md` and evolves with the code.
- ✅ `AgentDevTools` stays in the React adapter (it's a UI itself).
- ✅ Don't open a PR for the architecture doc yet — get feedback first.

---

## Open threads / what to do next

In rough priority:

1. **Read `docs/architecture.md`** rendered in GitHub or your editor. Sanity-check the diagrams against your mental model.
2. **Cross-check the `skipIf` claim.** Open `examples/basic/src/App.tsx:116-136` and confirm Diagram 5 captures it accurately. If it does, that's your case study for selling Q1.
3. **Decide whether to PR `docs/architecture.md`** (it's only on the feature branch right now). Could be useful as a discussion artifact even before any code changes.
4. **If you want to start Phase 1:** new branch off `main`, lift `AgentActionProvider:45-399` into `src/core/createPolter.ts`, rewire Provider to be a thin shell + `useSyncExternalStore`, run tests. Estimated ~1-2 days of work. Spec is in Q9 + Diagram 1b.
5. **If you want to start Phase 2 instead** (skipping Phase 1): port `find_and_email` to a `state({ test, achieve })` form in a branch, prove both paths produce identical `StepTrace[]`. Riskier (touches authoring API) but solves the bigger user-facing pain.

---

## Quick continuation prompts (paste into a fresh Claude session)

If you start a new session and want to continue:

> I'm continuing an architecture review of Polter. The working doc is at `docs/architecture.md` on branch `claude/evaluate-react-usage-xajfr`. Read it first. Context dump from the prior session is at `/tmp/polter-architecture-handoff.md` (if still present). I want to [pick one: open a PR for the doc / start Phase 1 / port `find_and_email` to goal-tree form / triage another open question].

For specific phases:

> Read `docs/architecture.md` and `src/components/AgentActionProvider.tsx`. Implement Phase 1 from the doc: lift lines 45-399 (registry + resolveTarget + resolveNamedTarget + waitForActionMount + execute) into a new `src/core/createPolter.ts` factory. Provider becomes a thin shell using `useSyncExternalStore`. Run `pnpm test` and verify `examples/basic` still works (`pnpm dev` from there, exercise `find_and_email`).

> Read `docs/architecture.md` (Q1 and Diagram 5) and `examples/basic/src/App.tsx:116-136`. Design the `state({ test, achieve })` API in `src/core/state.ts`. Port `find_and_email` to it as a proof, side-by-side with the existing steps array. Verify both produce identical `StepTrace[]`. Don't remove the old API — this ships alongside.

---

## Files referenced in this handoff

- `/home/user/polter/docs/architecture.md` — committed, the deliverable
- `/home/user/polter/src/components/AgentActionProvider.tsx` — Phase 1 lift target
- `/home/user/polter/src/executor/visualExecutor.ts` — Phase 2 target
- `/home/user/polter/examples/basic/src/App.tsx:116-136` — `skipIf` case study
- `/root/.claude/plans/polter-uses-react-at-compiled-curry.md` — original plan file (session-local, may not exist locally)
- `/tmp/polter-architecture-handoff.md` — this file
