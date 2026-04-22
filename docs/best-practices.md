# Best Practices

Polter implements **Agent-Driven UI (ADUI)** — agents that drive your existing,
permanent interface rather than generating a new one. The practices below flow
from that core principle: register actions where the real UI lives, keep them in
sync with what's on screen, and let users watch the agent click the same buttons
they'd click themselves.

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
  name: 'filter_and_export',
  description: 'Filter by status and export',
  parameters: z.object({
    status: z.enum(['all', 'active', 'archived']),
  }),
  steps: [
    { label: 'Clear search', setParam: 'query', defaultValue: '', fromTarget: 'search',
      skipIf: () => query === '' },
    { label: 'Open filter', fromTarget: 'status-toggle',
      skipIf: ({ status }) => statusFilter === status || dropdownOpen },
    { label: 'Pick status', fromParam: 'status',
      skipIf: ({ status }) => statusFilter === status },
    { label: 'Click export', fromTarget: 'export-btn' },
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
  name: 'delete_item',
  description: 'Delete an item by ID',
  parameters: z.object({ item_id: z.number() }),
  onExecute: (p) => handleDelete(p.item_id),
  steps: [{ label: 'Click Delete', fromParam: 'item_id' }],
});

// DOM ownership — AgentTargets live where the elements are rendered
<AgentTarget action="delete_item" param="item_id" value={String(id)}>
  <DeleteButton />
</AgentTarget>
```

Batch-register multiple actions in one call:

```tsx
useAgentAction([
  { name: 'view_item', ... },
  { name: 'delete_item', ... },
  { name: 'edit_item', ... },
]);
```

## Use `skipIf` to skip steps that are already satisfied

`skipIf` receives the action's params and returns `true` to skip the step.
Because `useAgentAction` reads the config at execution time, inline predicates
always see the latest component state:

```tsx
steps: [
  // Skip if the correct filter is already applied or the dropdown is already open
  { label: 'Open filter', fromTarget: 'filter-toggle',
    skipIf: ({ status }) => statusFilter === status || dropdownOpen },
  // Skip if already on the right status
  { label: 'Pick status', fromParam: 'status',
    skipIf: ({ status }) => statusFilter === status },
]
```

Common patterns:
- **Already applied**: `skipIf: ({ status }) => currentFilter === status`
- **Already open**: `skipIf: () => dropdownOpen`
- **Already selected**: `skipIf: ({ id }) => selectedId === id`
- **Combined**: `skipIf: ({ id }) => selectedId === id || query === name`

## Use `defaultValue` for fixed targets

When a step needs to target a specific value that isn't an action parameter, use
`defaultValue`:

```tsx
// "Reset to all" always targets the 'all' option — no param needed from the agent
{ label: 'Reset to all', fromParam: 'status', defaultValue: 'all',
  skipIf: () => statusFilter === 'all' }
```

`defaultValue` also works as a fallback for `setParam` — useful for clearing
inputs:

```tsx
// Clear search — types '' into the search input
{ label: 'Clear search', setParam: 'query', defaultValue: '', fromTarget: 'search',
  skipIf: () => query === '' }
```

## Use `<AgentAction>` for simple single-element actions

For the simplest case — one visible element, no parameters, no conditional steps
— wrapping with `<AgentAction>` is the shortest path:

```tsx
<AgentAction name="export_data" description="Export the current view to CSV">
  <ExportButton />
</AgentAction>
```

`<AgentStep>` is available as JSX shorthand when each step wraps its own visible
DOM element:

```tsx
<AgentAction name="submit_form" description="Submit the form">
  <AgentStep label="Open the form">
    <FormTrigger />
  </AgentStep>
  <AgentStep label="Click submit">
    <SubmitButton />
  </AgentStep>
</AgentAction>
```

For anything involving parameters, `skipIf`, or targets resolved at runtime
(`fromParam`/`fromTarget`), use `useAgentAction` instead.

## Wrap conditionally rendered elements with `<AgentAction>` on the outside

`<AgentAction>` always registers the action regardless of whether its children
are rendered. Keep the wrapper always-rendered and put the condition inside —
`onExecute` works even when there's nothing visible to spotlight:

```tsx
// Bad — conditionally rendering the AgentAction itself, action disappears when button is hidden
{selectedIds.size > 0 && (
  <AgentAction name="bulk_delete" description="Delete selected items" onExecute={() => handleDelete()}>
    <Button onClick={handleDelete}>Delete ({selectedIds.size})</Button>
  </AgentAction>
)}

// Good — AgentAction always registered, button conditionally rendered inside
<AgentAction name="bulk_delete" description="Delete selected items" onExecute={() => handleDelete()}>
  {selectedIds.size > 0 && (
    <Button onClick={handleDelete}>Delete ({selectedIds.size})</Button>
  )}
</AgentAction>
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
  { name: 'export_data', steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Export', fromTarget: 'export-btn' },
  ]},
  { name: 'archive_selected', steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Archive', fromTarget: 'archive-btn' },
  ]},
]);
```

## Use `AgentTarget prepareView` for modal interactions

When an action involves a modal or dialog with internal state, use `prepareView`
on `AgentTarget` to prepare the child component's state before polter interacts
with it. Use `setParam` on the step to visually type values into inputs — don't
set values programmatically when the user should see the interaction.

```tsx
// Action definition — 3-step flow: open dialog → type value → save
useAgentAction({
  name: 'update_setting',
  description: 'Update a numeric setting',
  parameters: z.object({ value: z.number() }),
  onExecute: async () => {
    // The save click starts async work — await it so the action
    // doesn't complete until the work is done.
    await savePromiseRef.current;
  },
  steps: [
    { label: 'Open settings', fromTarget: 'settings-btn' },
    { label: 'Set value', fromTarget: 'setting-input', setParam: 'value' },
    { label: 'Save', fromTarget: 'save-btn' },
  ],
});

// Parent component
<AgentTarget name="settings-btn">
  <SettingsButton />
</AgentTarget>

// Child component (dialog) — targets wrap interactive elements
function SettingsDialog({ onSave }) {
  const [mode, setMode] = useState("default");
  const [value, setValue] = useState(10);

  return (
    <Dialog>
      {/* prepareView switches to custom mode so the input is enabled */}
      <AgentTarget name="setting-input" prepareView={() => setMode("custom")}>
        <Input value={value} onChange={e => setValue(+e.target.value)} />
      </AgentTarget>

      <AgentTarget name="save-btn">
        <Button onClick={() => onSave(value)}>Save</Button>
      </AgentTarget>
    </Dialog>
  );
}
```

The flow:
1. Polter clicks the settings button → dialog opens
2. Polter polls for `setting-input` → `prepareView` switches to custom mode →
   polter **types** the value into the input
3. Polter polls for `save-btn` → spotlights and clicks Save
4. `onExecute` awaits the async work started by the click

**Key rules:**
- Use `prepareView` on `AgentTarget` for state changes that enable interaction
  (e.g. switching a mode so an input becomes enabled)
- Use `setParam` on the step to visually type values — don't set them
  programmatically
- Use `onExecute` to await async operations that the final click triggers
  (polter doesn't await click handlers)

## Dropdowns require at least two steps

With `onExecute`, the executor skips clicking the last step (to avoid
double-firing). If your action has only one step, the click never happens — the
dropdown won't open.

Use two steps — open, then select — and add `skipIf` to avoid redundant
interactions:

```tsx
useAgentAction({
  name: 'filter_by_status',
  description: 'Filter items by status',
  parameters: z.object({
    status: z.enum(['all', 'active', 'archived']),
  }),
  steps: [
    { label: 'Open filter', fromTarget: 'status-toggle',
      skipIf: ({ status }) => statusFilter === status || dropdownOpen },
    { label: 'Select option', fromParam: 'status',
      skipIf: ({ status }) => statusFilter === status },
  ],
});

// DOM
<AgentTarget name="status-toggle">
  <button onClick={() => setDropdownOpen(v => !v)}>
    Status: {statusFilter} ▾
  </button>
</AgentTarget>
{dropdownOpen && (
  <div className="dropdown-menu">
    {statuses.map(s => (
      <AgentTarget key={s} param="status" value={s}>
        <button onClick={() => { setStatusFilter(s); setDropdownOpen(false); }}>
          {s}
        </button>
      </AgentTarget>
    ))}
  </div>
)}
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
  name="save_changes"
  description="Save pending changes"
  disabled={!hasUnsavedChanges}
  disabledReason="No unsaved changes"
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
  { label: 'Open dropdown', fromTarget: 'toggle',
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
<AgentAction name="action_a">
  <AgentAction name="action_b">
    <AgentAction name="action_c">
      <ActualContent />
    </AgentAction>
  </AgentAction>
</AgentAction>

// Good — flat siblings, each wrapping its own element (or use the hook)
<AgentAction name="action_a">
  <ButtonA />
</AgentAction>
<AgentAction name="action_b">
  <ButtonB />
</AgentAction>
```
