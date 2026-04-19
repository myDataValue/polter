# Best Practices

Polter implements **Agent-Driven UI (ADUI)** — agents that drive your existing, permanent interface rather than generating a new one. The practices below flow from that core principle: register actions where the real UI lives, keep them in sync with what's on screen, and let users watch the agent click the same buttons they'd click themselves.

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
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Export', fromTarget: 'export-btn' },
  ],
});

// Component — for wrapping a single visible element
<AgentAction action={pushChanges}>
  <PushButton />
</AgentAction>
```

Both `useAgentAction` and `<AgentAction>` require an `action` prop — you cannot pass inline `name`/`description`/`parameters`. This ensures every action goes through `defineAction` and appears in the registry.

## Steps are the only way to build actions

There is no `onExecute`. The agent drives the UI by clicking through steps — the same way a human user would. Every action needs `steps` (or child `<AgentStep>` elements).

```tsx
// Good — agent clicks through the UI
useAgentAction({
  action: editMarkup,
  steps: [
    { label: 'Click edit', fromParam: 'property_id' },
    { label: 'Set value', fromTarget: 'markup-input', setParam: 'markup' },
    { label: 'Save', fromTarget: 'save-btn' },
    { label: 'Confirm', fromTarget: 'confirm-btn' },
  ],
});

// Bad — there is no onExecute in the API
useAgentAction({
  action: editMarkup,
  onExecute: (p) => saveMutation(p), // ❌ does not exist
});
```

For bulk operations, the agent selects properties first (via filter/selection actions), then performs the action on the selection — same as human users.

## Use `awaitResult` to wait for async side effects

When the last step click triggers async work (a mutation, a streaming response), use `awaitResult` to hold the action open until it completes. `awaitResult` should **wait** for work, not **do** work.

```tsx
useAgentAction({
  action: pushChanges,
  steps: [
    { label: 'Click Push', fromTarget: 'push-btn' },
  ],
  awaitResult: () => pushMutationPromiseRef.current,
});
```

## Use `<AgentAction>` when wrapping a visible element

The component pattern is for actions that have a single, visible UI element to spotlight:

```tsx
// Good — wraps the actual button
<AgentAction action={pushChanges}>
  <PushButton />
</AgentAction>
```

## Wrap conditionally rendered elements with `<AgentAction>` on the outside

`<AgentAction>` always registers the action regardless of whether its children are rendered. Keep the wrapper always-rendered and put the condition inside:

```tsx
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
  steps: [{ label: 'Click Sync', fromParam: 'property_id' }],
});

// AgentTarget on each row's button (in a column renderer)
<AgentTarget action="sync_property" param="property_id" value={String(propertyId)}>
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

Radix primitives (`PopoverTrigger`, `DialogTrigger`, `TooltipTrigger`) with `asChild` need their direct child to forward refs. `AgentTarget` inserts a `<div style="display:contents">` wrapper that breaks this:

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

Since `Popover.Root` renders no DOM element, `AgentTarget`'s `firstElementChild` resolves to the Button directly.

## Use shared targets for elements used by multiple actions

When two actions need the same trigger (e.g. both open the same overflow menu), omit the `action` prop to make a shared target:

```tsx
// Shared target — any action can resolve it by name
<AgentTarget name="overflow-menu-btn">
  <OverflowMenuPopover>
    <AgentTarget name="export-btn">
      <ExportButton />
    </AgentTarget>
    <AgentTarget name="freeze-btn">
      <FreezeButton />
    </AgentTarget>
  </OverflowMenuPopover>
</AgentTarget>

// Both actions find the same trigger
useAgentAction([
  { action: exportCsv, steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Export', fromTarget: 'export-btn' },
  ]},
  { action: toggleFreeze, steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Freeze', fromTarget: 'freeze-btn' },
  ]},
]);
```

## Use `AgentTarget prepareView` for modal interactions

When an action involves a modal or dialog with internal state, use `prepareView` on `AgentTarget` to prepare the child component's state before polter interacts with it. Use `setParam` on the step to visually type values into inputs.

```tsx
// Parent component — 3-step flow: open modal → type value → click confirm
<AgentAction action={runDiscount}>
  <AgentStep label="Open settings">
    <OpenButton />
  </AgentStep>
  <AgentStep label="Set discount" fromTarget="discount-input" setParam="pct" />
  <AgentStep label="Confirm" fromTarget="done-btn" />
</AgentAction>

// Child component (modal) — targets wrap interactive elements
function DiscountModal({ onConfirm }) {
  const [mode, setMode] = useState("preset");
  const [value, setValue] = useState(10);

  return (
    <Dialog>
      {/* prepareView selects Custom mode so the input is enabled */}
      <AgentTarget name="discount-input" prepareView={() => setMode("custom")}>
        <Input value={value} onChange={e => setValue(+e.target.value)} />
      </AgentTarget>

      <AgentTarget name="done-btn">
        <Button onClick={() => onConfirm(value)}>Done ({value}%)</Button>
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
  steps: [{ label: 'Open filter', fromTarget: 'filter-trigger' }],
});

// Good — two steps: click to open, then select option
useAgentAction({
  action: filterAction,
  steps: [
    { label: 'Open filter', fromTarget: 'filter-trigger' },
    { label: 'Select option', fromParam: 'status' },
  ],
});
```

## Communicating state to the agent

There are three mechanisms for informing the agent about action availability and context. Each serves a different purpose — they are not interchangeable.

**`description` — static preconditions (advisory)**

Use for things that are always true about the action. The LLM reads the description in the tool schema and reasons about it. Nothing prevents the LLM from ignoring it — it's guidance, not enforcement.

```ts
export const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant bot access to properties. Requires user to be logged in to extranet.',
});
```

Good for: auth requirements, feature flags, usage notes that don't change at runtime.

**`disabled` / `disabledReason` — dynamic availability (enforced)**

Use for state that changes at runtime and the agent must not violate. Disabled actions are removed from the tool schema entirely — the LLM cannot call them.

```tsx
<AgentAction
  action={pushChanges}
  disabled={!hasPendingChanges}
  disabledReason="No pending changes to push"
>
  <PushButton />
</AgentAction>
```

Good for: conditions that change during a session (pending changes, selection state, loading). Only works for mounted actions — registry-only actions can't be dynamically disabled.

**App-level context — dynamic page state (advisory)**

Polter exposes `schemas` and `availableActions` via `useAgentActions()`. Send these alongside your own app context (current page, filters, selections) to your agent backend however your transport works (WebSocket, REST, etc.):

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

Good for: ambient state the agent needs for reasoning across all actions — not specific to any single action.

## Don't deeply nest `<AgentAction>` wrappers

Each `<AgentAction>` renders a `<div style="display:contents">`. Nesting them creates a chain of `display:contents` divs. `getBoundingClientRect()` on these returns all zeros, causing spotlights to appear at (0,0):

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
