# Best Practices

Polter implements **Agent-Driven UI (ADUI)** — agents that drive your existing, permanent interface rather than generating a new one. The practices below flow from that core principle: register actions where the real UI lives, keep them in sync with what's on screen, and let users watch the agent click the same buttons they'd click themselves.

## Use `<AgentAction>` when wrapping a visible element

The component pattern is for actions that have a single, visible UI element to spotlight:

```tsx
// Good — wraps the actual button
<AgentAction name="push_changes" description="Push pending changes">
  <PushButton />
</AgentAction>

// Bad — wraps nothing visible, renders a pointless display:contents div
<AgentAction name="sync_data" description="Sync data"
  onExecute={handleSync} />
```

## Wrap conditionally rendered elements with `<AgentAction>` on the outside

`<AgentAction>` always registers the action regardless of whether its children are rendered. Keep the wrapper always-rendered and put the condition inside — `onExecute` works even when there's nothing visible to spotlight:

```tsx
// Bad — conditionally rendering the AgentAction itself, action disappears when button is hidden
{selectedIds.size > 0 && (
  <AgentAction name="grant_access" description="Grant access" onExecute={() => handleGrant()}>
    <Button onClick={handleGrant}>Grant Access ({selectedIds.size})</Button>
  </AgentAction>
)}

// Good — AgentAction always registered, button conditionally rendered inside
<AgentAction name="grant_access" description="Grant access" onExecute={() => handleGrant()}>
  {selectedIds.size > 0 && (
    <Button onClick={handleGrant}>Grant Access ({selectedIds.size})</Button>
  )}
</AgentAction>
```

## Use `useAgentAction` hook for per-row and programmatic actions

When N rows each have their own button (sync, edit, navigate), you can't wrap each with `<AgentAction>` — same name would register N times, each overwriting the last. Use the hook + `<AgentTarget>` on each row's element:

```tsx
// Hook registers the action once
useAgentAction({
  name: 'sync_property',
  description: 'Sync a property',
  parameters: z.object({ property_id: z.number() }),
  onExecute: (p) => handleSync(p.property_id),
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
  { name: 'navigate_to_property', ... },
  { name: 'sync_property', ... },
  { name: 'edit_markup', ... },
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
  { name: 'export_csv', steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Export', fromTarget: 'export-btn' },
  ]},
  { name: 'toggle_freeze', steps: [
    { label: 'Open menu', fromTarget: 'overflow-menu-btn' },
    { label: 'Click Freeze', fromTarget: 'freeze-btn' },
  ]},
]);
```

## Use `AgentTarget prepareView` for modal interactions

When an action involves a modal or dialog with internal state, use `prepareView` on `AgentTarget` to prepare the child component's state before polter interacts with it. Use `setParam` on the `AgentStep` to visually type values into inputs — don't set values programmatically when the user should see the interaction.

```tsx
// Parent component — 3-step flow: open modal → type value → click confirm
<AgentAction name="run_discount" parameters={z.object({ pct: z.number() })}
  onExecute={async () => {
    // The confirm click starts async work — await it here so the action
    // doesn't complete until the work is done.
    await streamingPromiseRef.current;
  }}>
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

The flow:
1. Polter clicks the entry button → modal opens
2. Polter polls for `discount-input` → `prepareView` selects Custom mode → polter **types** the value into the input
3. Polter polls for `done-btn` → spotlights and clicks Confirm
4. `onExecute` awaits the async work started by the click

**Key rules:**
- Use `prepareView` on `AgentTarget` for state changes that enable interaction (e.g. selecting a radio so an input becomes enabled)
- Use `setParam` on `AgentStep` to visually type values — don't set them programmatically
- Use `onExecute` to await async operations that the final click triggers (polter doesn't await click handlers)

## Multi-step is required for dropdowns

With `onExecute`, the executor skips clicking the last step (to avoid double-firing). If your action has only one step, the click never happens — the dropdown won't open:

```tsx
// Bad — single step with onExecute, dropdown never opens
<AgentAction name="filter" onExecute={handleFilter}>
  <Select>...</Select>
</AgentAction>

// Good — two steps: click to open, then select option
<AgentAction name="filter" onExecute={handleFilter}>
  <AgentStep label="Open filter">
    <Select>
      <SelectTrigger>...</SelectTrigger>
      <SelectContent>
        <AgentTarget action="filter" param="status" value="active">
          <SelectItem value="active">Active</SelectItem>
        </AgentTarget>
      </SelectContent>
    </Select>
  </AgentStep>
  <AgentStep label="Select option" fromParam="status" />
</AgentAction>
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
  name="push_changes"
  description="Push pending markup changes"
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
