<p align="center">
  <img src="logo.svg?raw=true" alt="Polter" width="200" />
</p>

<h1 align="center">polter</h1>

<p align="center">Declarative React library for agent-driven UI control with visual guided execution.</p>

<p align="center">
  <video src="https://github.com/myDataValue/polter/raw/master/docs/polter.webm" width="800" autoplay loop muted playsinline controls></video>
</p>

<p align="center">
  <a href="https://stackblitz.com/github/myDataValue/polter/tree/master/examples/basic"><strong>▶ Try it on StackBlitz</strong></a>
  ·
  <a href="https://codesandbox.io/p/github/myDataValue/polter/master?import=true&workspace=examples/basic">CodeSandbox</a>
  ·
  <a href="https://mydatavalue.github.io/polter/">Website</a>
</p>

Your UI *is* the agent's interface. It opens the actual dropdown, clicks the actual button, with the user watching. No separate tools to build — single source of truth. After seeing it twice, users do it themselves.

## Why

Every SaaS adding an AI agent faces two problems:

1. **Double the work.** You build your UI, then build a whole separate set of agent tools — API endpoints, handlers, schemas — all duplicating what the UI already does.

2. **Users never learn.** The agent does things behind the scenes or generates throwaway UI. Either way, users never see where buttons are or how the interface works. Permanent dependency.

**Polter solves both.** Your UI *is* the agent's interface — single source of truth. The agent scrolls to the real button, spotlights it, clicks it. Users watch and learn. After twice, they do it themselves. And you wrote zero agent-specific tools.

## Install

```bash
npm install polter
# peer deps
npm install react react-dom zod
```

## Quick Start

```tsx
import { AgentActionProvider, AgentAction, useAgentActions } from 'polter';
import { z } from 'zod';
```

### 1. Wrap your app

```tsx
<AgentActionProvider mode="guided" stepDelay={600}>
  <App />
</AgentActionProvider>
```

### 2. Register actions

**Visual actions** — wrap an element, the agent spotlights and clicks it:

```tsx
<AgentAction name="export_csv" description="Export properties to CSV">
  <ExportButton />
</AgentAction>
```

**Parameterized actions** — spotlight the element, call your function:

```tsx
<AgentAction
  name="sync_properties"
  description="Sync specific properties"
  parameters={z.object({
    property_ids: z.array(z.number()).optional().describe("IDs to sync")
  })}
  onExecute={(params) => triggerSync(params.property_ids)}
>
  <SyncButton />
</AgentAction>
```

**Multi-step actions** — sequential clicks (e.g. open dropdown, then select):

```tsx
<AgentAction name="sync_data" description="Sync from API">
  <AgentStep label="Open sync menu">
    <DropdownTrigger />
  </AgentStep>
  <AgentStep label="Click sync">
    <SyncButton />
  </AgentStep>
</AgentAction>
```

**Modal interactions** — click a button to open a modal, type a value, then confirm:

```tsx
// Parent — 3-step flow: open → type → confirm
<AgentAction name="apply_discount" parameters={z.object({ pct: z.number() })}
  onExecute={async () => { /* await async work started by the confirm click */ }}>
  <AgentStep label="Open settings">
    <SettingsButton />
  </AgentStep>
  <AgentStep label="Set value" fromTarget="discount-input" setParam="pct" />
  <AgentStep label="Confirm" fromTarget="confirm-btn" />
</AgentAction>

// Child (modal) — targets with prepareView to set up internal state
<AgentTarget name="discount-input" prepareView={() => setMode("custom")}>
  <Input value={value} onChange={...} />
</AgentTarget>
<AgentTarget name="confirm-btn">
  <ConfirmButton />
</AgentTarget>
```

### 3. Connect to your agent

```tsx
const { schemas, execute, availableActions, isExecuting } = useAgentActions();

// Send schemas to your agent backend (auto-updates as components mount/unmount)
// Call execute("action_name", params) when the agent responds with a tool call
```

### 4. Integrate with existing handlers

```tsx
import { useAgentCommandRouter } from 'polter';

// Wraps any existing command handler — registered actions get visual execution,
// unregistered ones fall through to your original handler.
const handleCommand = useAgentCommandRouter(existingHandler, (cmd) => cmd.action);
```

## How it works

1. `<AgentAction>` registers actions in a React context on mount, deregisters on unmount
2. The registry always reflects exactly what's on screen — schemas auto-generate from Zod parameter definitions
3. `execute(name, params)` looks up the action, finds the DOM element via refs, runs: **scroll into view → dim surroundings → spotlight with pulsing ring → tooltip → pause → click/execute → cleanup**
4. `<div style="display: contents">` wrapper provides DOM refs without affecting layout
5. Components that mount = actions that exist. Navigate away = actions disappear. No manual sync.

## Advanced: `defineAction()` + Registry

For multi-page apps, `<AgentAction>` schemas are only available when the component is mounted. If the user says "update the price on property 123" but that page isn't open, the agent can't see the action.

`defineAction()` solves this — schemas are available at import time, before any component mounts. Combined with the `registry` prop, the agent gets full knowledge of every action upfront (single LLM roundtrip).

### 1. Define actions (co-located with your feature)

```tsx
// features/pricing/actions.ts
import { defineAction } from 'polter';
import { z } from 'zod';

export const updatePrice = defineAction({
  name: 'update_price',
  description: 'Update price markup on a property',
  parameters: z.object({
    property_id: z.string(),
    markup: z.number(),
  }),
  route: (p) => `/properties/${p.property_id}/pricing`,
});
```

### 2. Create a registry (barrel file)

```tsx
// registry.ts
import { updatePrice } from './features/pricing/actions';
import { exportCsv } from './features/reports/actions';

export const agentRegistry = [updatePrice, exportCsv];
```

### 3. Pass to provider with your router

```tsx
import { agentRegistry } from './registry';

<AgentActionProvider
  registry={agentRegistry}
  navigate={(path) => router.push(path)}
>
  <App />
</AgentActionProvider>
```

### 4. Components reference the definition

```tsx
// features/pricing/PricingPage.tsx
import { updatePrice } from './actions';

<AgentAction action={updatePrice} onExecute={(p) => setMarkup(p.markup)}>
  <SaveButton />
</AgentAction>
```

### How it works

1. On mount, the provider registers all registry actions as schema-only entries — the agent sees them immediately
2. When the agent calls `execute('update_price', { property_id: '123', markup: 15 })`:
   - Provider calculates the route: `/properties/123/pricing`
   - Calls your `navigate()` function
   - Waits for the `<AgentAction>` component to mount on the new page
   - Runs the visual execution (spotlight, click, etc.)
3. When the component unmounts (user navigates away), the action reverts to schema-only — never disappears from the agent's view

If an action has no corresponding UI element anywhere in the app, you can provide `onExecute` directly on the definition as an escape hatch — it will execute without navigation or spotlight.

## API

### Execution modes

| Mode | Behavior | Use case |
|------|----------|----------|
| `"guided"` | Scroll → spotlight → pause → click | Teaching users, first-time flows |
| `"instant"` | Execute immediately, no visual | Power users, repeat actions |

### Provider props

| Prop | Type | Default |
|------|------|---------|
| `mode` | `"guided" \| "instant"` | `"guided"` |
| `stepDelay` | `number` | `600` |
| `overlayOpacity` | `number` | `0.5` |
| `spotlightPadding` | `number` | `8` |
| `tooltipEnabled` | `boolean` | `true` |
| `onExecutionStart` | `(name: string) => void` | — |
| `onExecutionComplete` | `(result: ExecutionResult) => void` | — |
| `registry` | `ActionDefinition[]` | — |
| `navigate` | `(path: string) => void \| Promise<void>` | — |

### Disabled actions

```tsx
<AgentAction
  name="push_changes"
  description="Push pending changes"
  disabled={!hasPendingChanges}
  disabledReason="No pending changes to push"
>
  <PushButton />
</AgentAction>
```

Disabled actions appear in `availableActions` but are excluded from `schemas`. Calling `execute()` on a disabled action returns `{ success: false, error: "No pending changes to push" }`.

### CSS customization

All overlay elements have class names:

```css
.polter-spotlight { /* box-shadow overlay with cutout */ }
.polter-ring { /* pulsing border around target */ }
.polter-tooltip { /* label tooltip */ }
```

## Best practices

See [docs/best-practices.md](docs/best-practices.md) for patterns around conditional rendering, per-row actions, Radix integration, dropdowns, and common pitfalls.

## Zero dependencies

Peer deps only: React 18+ and Zod. No runtime dependencies.

## License

MIT
