# Best Practices

Polter implements **Agent-Driven UI (ADUI)** — agents that drive your existing,
permanent interface rather than generating a new one. The practices below flow
from that core principle: register actions where the real UI lives, keep them in
sync with what's on screen, and let users watch the agent click the same buttons
they'd click themselves.

**The #1 mistake: reaching for programmatic shortcuts.** When you need to select
rows, filter a table, or prepare state for a step — don't dispatch events, set
refs, or call `setState` behind the scenes. Instead, ask: "what would a human
click?" Then add steps that click those same elements. If the target belongs to
another action, make it a shared `<AgentTarget>` (no `action` prop) so any action
can reach it. Every interaction the agent performs should be visible to the user.

## Every action starts with `defineAction`

All actions must be defined via `defineAction` in a static `actions.ts` file. This provides the schema (name, description, parameters, route) upfront — before any component mounts. The registry collects these definitions so the agent backend knows all available actions for tool discovery.

```ts
// actions.ts — single source of truth for schema
export const exportCsv = defineAction({
  name: 'export_csv',
  description: 'Export the current table to CSV',
  route: () => '/dashboard',
});

export const editMarkup = defineAction({
  name: 'edit_markup',
  description: 'Edit markup for a property',
  parameters: z.object({
    property_id: z.number(),
    markup: z.number(),
  }),
  route: () => '/dashboard',
});
```

Then provide runtime behavior (steps) via `useAgentAction` or `<AgentAction>`:

```tsx
// Hook — for per-row and programmatic actions
useAgentAction({
  action: exportCsv,
  steps: [
    { label: 'Open menu', target: 'overflow-menu-btn' },
    { label: 'Click Export', target: 'export-btn' },
  ],
});

// Component — for wrapping a single visible element
<AgentAction action={pushChanges}>
  <PushButton />
</AgentAction>
```

Both `useAgentAction` and `<AgentAction>` require an `action` prop — you cannot pass inline `name`/`description`/`parameters`. This ensures every action goes through `defineAction` and appears in the registry.

## Steps are the only way to build actions

The agent drives the UI by clicking through steps — the same way a human user would. Every action needs `steps`.

```tsx
useAgentAction({
  action: editMarkup,
  steps: [
    { label: 'Click edit', target: (p) => `edit:${p.property_id}` },
    { label: 'Set value', target: 'markup-input', value: fromParam('markup') },
    { label: 'Save', target: 'save-btn' },
    { label: 'Confirm', target: 'confirm-btn' },
  ],
});
```

For bulk operations, the agent selects properties first (via filter/selection actions), then performs the action on the selection — same as human users.

## Use `waitFor` to wait for async side effects

When the last step click triggers async work (a mutation, a streaming response), use `waitFor` to hold the action open until it completes.

**Prefer the ref form** — a React ref whose `.current` is set to a Promise by the click handler. It's impossible to accidentally "do work" in a ref:

```tsx
const pushRef = useRef<Promise<void>>();

// Button's onClick sets the ref
<Button onClick={() => { pushRef.current = pushMutation(); }} />

useAgentAction({
  action: pushChanges,
  steps: [
    { label: 'Click Push', target: 'push-btn' },
  ],
  waitFor: pushRef,
});
```

## Put cross-page steps in `defineAction`

When a step click causes a page navigation, the next step's target doesn't exist yet — it's on the new page. The executor polls up to 5s for each step's target to appear, so cross-page actions work automatically. For targets that take longer to load (API calls), render them with `disabled` during loading — polter polls past disabled elements and clicks when they become enabled.

Define these steps on `defineAction` since they're static and don't need React closures:

```ts
export const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant bot access',
  steps: [
    { label: 'Click Settings', target: 'settings-tab' },
    { label: 'Click Grant Access', target: 'grant-link' },
  ],
});
```

The `<AgentTarget>` elements on each page register themselves globally. After the executor clicks 'settings-tab' and the Settings page mounts, 'grant-link' appears in the target registry — the executor finds it and clicks it.

**Put ALL steps for cross-page actions in `defineAction` — never split between `defineAction` and component steps.** If some steps navigate to a page and other steps interact with elements on that page, all of them belong in `defineAction`. The components on the target page should only have `<AgentTarget>` markers, not `<AgentAction>` wrappers with their own steps.

Splitting steps between `defineAction` (navigation) and component `useAgentAction` (interaction) creates a two-phase executor flow that is racy — the component might not mount before the executor checks for it, causing the second phase to silently drop.

```tsx
// Bad — navigation in defineAction, interaction in component (race condition)
export const grantAccess = defineAction({
  steps: [
    { label: 'Click Settings', target: 'settings-tab' },
    { label: 'Click Grant', target: 'grant-link' },
  ],
});

// Component on target page — steps may never execute
useAgentAction({
  action: grantAccess,
  steps: [
    { label: 'Select all', target: 'select-all' },
    { label: 'Confirm', target: 'confirm-btn' },
  ],
});

// Good — all steps in defineAction, component just has targets
export const grantAccess = defineAction({
  steps: [
    { label: 'Click Settings', target: 'settings-tab' },
    { label: 'Click Grant', target: 'grant-link' },
    { label: 'Select all', target: 'select-all' },
    { label: 'Confirm', target: 'confirm-btn' },
  ],
});

// Component on target page — just markers
<AgentTarget name="select-all"><Checkbox /></AgentTarget>
<AgentTarget name="confirm-btn"><Button>Confirm</Button></AgentTarget>
```

If a component also provides steps via `useAgentAction`, those override the `defineAction` steps. Use this when you need `skipIf` or other runtime closures on same-page actions.

## Design actions around outcomes, not interactions

Actions should describe *what the user wants to achieve* — not the mechanical
steps to get there.

```tsx
// Bad — imperative, one action per UI interaction
name: 'toggle_dropdown'
name: 'click_option'
name: 'click_download'

// Good — declarative, describes the desired outcome
name: 'filter_and_export'
parameters: z.object({ status: z.enum(['all', 'active', 'archived']) })
```

The agent says "filter to active items and export" — a single action with the
desired end-state as a parameter. Each step declares a `skipIf` predicate that
checks whether its interaction is still needed to reach that state:

```tsx
useAgentAction({
  action: filterAndExport,
  steps: [
    { label: 'Clear search', value: '', target: 'search',
      skipIf: () => query === '' },
    { label: 'Open filter', target: 'status-toggle',
      skipIf: ({ status }) => statusFilter === status || dropdownOpen },
    { label: 'Pick status', target: (p) => `status:${p.status}`,
      skipIf: ({ status }) => statusFilter === status },
    { label: 'Click export', target: 'export-btn' },
  ],
});
```

If the filter is already set to "active", steps 1–3 are skipped and the agent
goes straight to Export. The action works regardless of starting state — no
assumptions about what the user has already done.

## Use `useAgentAction` for action registration

`useAgentAction` is the recommended way to register actions. It separates action
logic from DOM ownership — you define steps as data, and `<AgentTarget>`
components mark the DOM elements the agent interacts with:

```tsx
// Action definition — lives in the component that owns the state
useAgentAction({
  action: deleteItem,
  steps: [{ label: 'Click Delete', target: (p) => `delete:${p.item_id}` }],
});

// DOM ownership — AgentTargets live where the elements are rendered
<AgentTarget name={`delete_item/delete:${id}`}>
  <DeleteButton />
</AgentTarget>
```

Batch-register multiple actions in one call:

```tsx
useAgentAction([
  { action: viewItem, steps: [...] },
  { action: deleteItem, steps: [...] },
  { action: editItem, steps: [...] },
]);
```

## Use `skipIf` to skip steps that are already satisfied

`skipIf` receives the action's params and returns `true` to skip the step.
Because `useAgentAction` reads the config at execution time, inline predicates
always see the latest component state:

```tsx
steps: [
  // Skip if the correct filter is already applied or the dropdown is already open
  { label: 'Open filter', target: 'filter-toggle',
    skipIf: ({ status }) => statusFilter === status || dropdownOpen },
  // Skip if already on the right status
  { label: 'Pick status', target: (p) => `status:${p.status}`,
    skipIf: ({ status }) => statusFilter === status },
]
```

Common patterns:
- **Already applied**: `skipIf: ({ status }) => currentFilter === status`
- **Already open**: `skipIf: () => dropdownOpen`
- **Already selected**: `skipIf: ({ id }) => selectedId === id`
- **Combined**: `skipIf: ({ id }) => selectedId === id || query === name`

## Use a static `target` for fixed names

When a step always points at the same element regardless of params, pass a
plain string:

```tsx
// "Reset to all" always targets the 'all' option — no param needed from the agent
{ label: 'Reset to all', target: 'status:all',
  skipIf: () => statusFilter === 'all' }
```

A literal string `value` types a fixed value — useful for clearing inputs:

```tsx
// Clear search — types '' into the search input
{ label: 'Clear search', value: '', target: 'search',
  skipIf: () => query === '' }
```

Use `fromParam()` to extract a named param as the value:

```tsx
{ label: 'Type name', value: fromParam('name'), target: 'search' }
```

## Use `<AgentAction>` for simple single-element actions

For the simplest case — one visible element, no parameters, no conditional steps
— wrapping with `<AgentAction>` is the shortest path:

```tsx
<AgentAction action={exportData}>
  <ExportButton />
</AgentAction>
```

For anything involving multiple steps, parameters, `skipIf`, or targets
resolved at runtime, use `useAgentAction` with `steps[]`. This keeps the
action's full shape in one place and matches how cross-page steps in
`defineAction` already work.

## Wrap conditionally rendered elements with `<AgentAction>` on the outside

`<AgentAction>` always registers the action regardless of whether its children are rendered. Keep the wrapper always-rendered and put the condition inside:

```tsx
// Bad — conditionally rendering the AgentAction itself, action disappears when button is hidden
{isReady && (
  <AgentAction action={grantAccess}>
    <Button onClick={handleGrant}>Grant Access</Button>
  </AgentAction>
)}

// Good — AgentAction always registered, button conditionally rendered inside
<AgentAction action={grantAccess} disabled={!isReady} disabledReason="Not ready">
  {isReady && (
    <Button onClick={handleGrant}>Grant Access</Button>
  )}
</AgentAction>
```

## Use `useAgentAction` hook for per-row and programmatic actions

When N rows each have their own button (sync, edit, navigate), you can't wrap each with `<AgentAction>` — same name would register N times, each overwriting the last. Use the hook + `<AgentTarget>` on each row's element:

```tsx
// Hook registers the action once
useAgentAction({
  action: syncProperty,
  steps: [{ label: 'Click Sync', target: (p) => `sync:${p.property_id}` }],
});

// AgentTarget on each row's button (in a column renderer) — encode the
// row identity into the name so the step's target function can find it.
<AgentTarget name={`sync_property/sync:${propertyId}`}>
  <SyncButton />
</AgentTarget>
```

The hook also accepts an array to batch-register multiple actions in one call:

```tsx
useAgentAction([
  { action: navigateToProperty, steps: [...] },
  { action: syncProperty, steps: [...] },
  { action: editMarkup, steps: [...] },
]);
```

## Never nest `AgentTarget` inside Radix `asChild` components

Radix primitives (`PopoverTrigger`, `DialogTrigger`, `TooltipTrigger`) with
`asChild` need their direct child to forward refs. `AgentTarget` inserts a `<div
style="display:contents">` wrapper that breaks this:

```tsx
// Bad — breaks ref forwarding, trigger won't work
<PopoverTrigger asChild>
  <AgentTarget name="my-btn">
    <Button>Open</Button>
  </AgentTarget>
</PopoverTrigger>

// Good — wrap outside the Popover entirely
<AgentTarget name="my-btn">
  <Popover>
    <PopoverTrigger asChild>
      <Button>Open</Button>
    </PopoverTrigger>
    <PopoverContent>...</PopoverContent>
  </Popover>
</AgentTarget>
```

Since `Popover.Root` renders no DOM element, `AgentTarget`'s `firstElementChild`
resolves to the Button directly.

## `AgentTarget` must resolve to the interactive element

`element.click()` fires on the target element and bubbles **up** — it does not
propagate down to children. If `AgentTarget` resolves to a wrapper (span, div)
with the actual interactive element (button, checkbox, input) nested inside,
polter's click never reaches it.

```tsx
// Bad — AgentTarget resolves to the <span>, click doesn't reach Checkbox
<AgentTarget name="select-all">
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Checkbox onCheckedChange={handleChange} />
      </span>
    </TooltipTrigger>
  </Tooltip>
</AgentTarget>

// Good — AgentTarget wraps the Checkbox directly
<Tooltip>
  <TooltipTrigger asChild>
    <span>
      <AgentTarget name="select-all">
        <Checkbox onCheckedChange={handleChange} />
      </AgentTarget>
    </span>
  </TooltipTrigger>
</Tooltip>
```

This is the inverse of the Radix `asChild` rule above. Both come from the same
principle: polter clicks whatever element `AgentTarget` resolves to, so that
element must be the one with the click handler.

## Bulk operations: search + select + act

When an action accepts an array of IDs and needs to apply to all of them, compose
shared targets from the existing UI — don't reach for programmatic state
manipulation. The pattern is: filter the table to the target rows, select them,
then edit one — the save callback applies to the full selection.

```tsx
useAgentAction({
  action: editMarkup, // parameters: { property_ids: number[], markup: number }
  steps: [
    // 1. Type IDs into the search box — String([1,2,3]) produces "1,2,3"
    { label: 'Filter to target properties', target: 'search-input',
      value: fromParam('property_ids'),
      skipIf: (p) => (p.property_ids as number[]).length <= 1 },

    // 2. Select all filtered rows
    { label: 'Select all filtered', target: 'select-all-checkbox',
      skipIf: (p) => (p.property_ids as number[]).length <= 1 },

    // 3. Click edit on the first property — `target` as a function builds the
    //    AgentTarget name from params.
    { label: 'Click edit', target: (p) => `edit:${(p.property_ids as number[])[0]}` },

    // 4. Type the value — save callback sees the selection and applies to all
    { label: 'Set value', target: 'markup-input', value: fromParam('markup') },
  ],
});
```

Key ingredients:
- **Shared targets** — `search-input` and `select-all-checkbox` have no `action`
  prop, so any action can resolve them
- **`target` as a function** — for per-row targets, the step builds the name
  from params (e.g. `(p) => `edit:${p.property_ids[0]}``); the matching
  `<AgentTarget name={`edit:${id}`}>` registers each row
- **`skipIf`** — single-ID calls skip the search/select steps and edit directly
- **`fromParam` on arrays** — `String([id1, id2])` produces `"id1,id2"`, which the
  search box accepts as a comma-separated filter
- **Existing save callback** — the table's save handler already checks
  `getSelectedRowIds()` and applies to all selected rows, showing a confirmation
  dialog for the user to approve

This is pure ADUI: the user sees polter type IDs into the search box, click
select-all, click edit, and type the value. No programmatic state preparation,
no `scrollTo` hacks, no event dispatching.

## Use shared targets for elements used by multiple actions

When two actions need the same trigger (e.g. both open the same overflow menu),
omit the `action` prop to make a shared target:

```tsx
// Shared target — any action can resolve it by name
<AgentTarget name="overflow-menu-btn">
  <OverflowMenuPopover>
    <AgentTarget name="export-btn">
      <ExportButton />
    </AgentTarget>
    <AgentTarget name="archive-btn">
      <ArchiveButton />
    </AgentTarget>
  </OverflowMenuPopover>
</AgentTarget>

// Both actions find the same trigger
useAgentAction([
  { action: exportCsv, steps: [
    { label: 'Open menu', target: 'overflow-menu-btn' },
    { label: 'Click Export', target: 'export-btn' },
  ]},
  { action: archiveSelected, steps: [
    { label: 'Open menu', target: 'overflow-menu-btn' },
    { label: 'Click Archive', target: 'archive-btn' },
  ]},
]);
```

## Modal interactions use steps, not programmatic state

When an action involves a modal or dialog, each interaction is a step. Use `value` on the step to visually type values into inputs. If the dialog has modes (e.g. preset vs custom), the agent clicks the mode selector as a step — don't set state programmatically.

Use `useAgentAction` with `steps[]` for these flows — keeping the steps as
data makes the action's shape obvious in one place.

```tsx
// 4-step flow: open modal → select mode → type value → confirm
useAgentAction({
  action: runDiscount,
  steps: [
    { label: 'Open settings', target: 'open-settings-btn' },
    { label: 'Select custom mode', target: 'custom-mode-radio' },
    { label: 'Set discount', target: 'discount-input', value: fromParam('pct') },
    { label: 'Confirm', target: 'done-btn' },
  ],
});

// Trigger button — just a target
<AgentTarget name="open-settings-btn">
  <OpenButton />
</AgentTarget>

// Child component (dialog) — targets wrap interactive elements
function SettingsDialog({ onSave }) {
  const [mode, setMode] = useState("default");
  const [value, setValue] = useState(10);

  return (
    <Dialog>
      <AgentTarget name="custom-mode-radio">
        <Radio checked={mode === "custom"} onChange={() => setMode("custom")} />
      </AgentTarget>

      <AgentTarget name="discount-input">
        <Input value={value} onChange={e => setValue(+e.target.value)} disabled={mode !== "custom"} />
      </AgentTarget>

      <AgentTarget name="done-btn">
        <Button onClick={() => onSave(value)}>Save</Button>
      </AgentTarget>
    </Dialog>
  );
}
```

## Multi-step is required for dropdowns

Polter clicks every step in sequence. If your action has only one step wrapping a dropdown, the click opens it — but there's no second step to select an option:

```tsx
// Bad — single step, dropdown opens but nothing is selected
useAgentAction({
  action: filterAction,
  steps: [{ label: 'Open filter', target: 'filter-trigger' }],
});

// Good — two steps: click to open, then select option
useAgentAction({
  action: filterAction,
  steps: [
    { label: 'Open filter', target: 'filter-trigger' },
    { label: 'Select option', target: (p) => `status:${p.status}` },
  ],
});
```

## Communicating state to the agent

There are four mechanisms for informing the agent about action availability and
context. Each serves a different purpose — they are not interchangeable.

**`description` — static preconditions (advisory)**

Use for things that are always true about the action. The LLM reads the
description in the tool schema and reasons about it. Nothing prevents the LLM
from ignoring it — it's guidance, not enforcement.

```ts
export const importData = defineAction({
  name: 'import_data',
  description: 'Import data from external source. Requires an active API connection.',
});
```

Good for: auth requirements, feature flags, usage notes that don't change at
runtime.

**`disabled` / `disabledReason` — dynamic availability (enforced)**

Use for state that changes at runtime and the agent must not violate. Disabled
actions are removed from the tool schema entirely — the LLM cannot call them.

```tsx
<AgentAction
  action={pushChanges}
  disabled={!hasPendingChanges}
  disabledReason="No pending changes to push"
>
  <SaveButton />
</AgentAction>
```

Good for: conditions that change during a session (pending changes, selection
state, loading). Only works for mounted actions — registry-only actions can't be
dynamically disabled.

**`skipIf` — step-level preconditions (enforced)**

Use for steps within an action that may or may not be needed depending on
current UI state. Unlike `disabled` (which prevents the entire action), `skipIf`
allows the action to proceed while skipping individual steps that are already
satisfied.

```tsx
steps: [
  { label: 'Open dropdown', target: 'toggle',
    skipIf: ({ status }) => statusFilter === status || dropdownOpen },
]
```

Good for: multi-step actions where some steps are conditional on current state
(filter already applied, modal already open, value already entered).

**App-level context — dynamic page state (advisory)**

Polter exposes `schemas` and `availableActions` via `useAgentActions()`. Send
these alongside your own app context (current page, filters, selections) to your
agent backend however your transport works (WebSocket, REST, etc.):

```tsx
const { schemas } = useAgentActions();

// Your app sends schemas + page context to the agent backend
useEffect(() => {
  sendToBackend({
    available_tools: schemas,
    current_page: 'dashboard',
    search_query: searchTerm,
    selected_count: selectedIds.size,
  });
}, [schemas, searchTerm, selectedIds.size]);
```

Good for: ambient state the agent needs for reasoning across all actions — not
specific to any single action.

## Don't deeply nest `<AgentAction>` wrappers

Each `<AgentAction>` renders a `<div style="display:contents">`. Nesting them
creates a chain of `display:contents` divs. `getBoundingClientRect()` on these
returns all zeros, causing spotlights to appear at (0,0):

```tsx
// Bad — nested wrappers, inner actions resolve to display:contents divs
<AgentAction action={actionA}>
  <AgentAction action={actionB}>
    <AgentAction action={actionC}>
      <ActualContent />
    </AgentAction>
  </AgentAction>
</AgentAction>

// Good — flat siblings, each wrapping its own element (or use the hook)
<AgentAction action={actionA}>
  <ButtonA />
</AgentAction>
<AgentAction action={actionB}>
  <ButtonB />
</AgentAction>
```
