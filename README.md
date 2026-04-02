<p align="center">
  <img src="logo.svg?raw=true" alt="Polter" width="200" />
</p>

<h1 align="center">polter</h1>

<p align="center">Declarative React library for agent-driven UI control with visual guided execution.</p>

The agent drives the **real UI** — it opens the actual dropdown, clicks the actual button, with the user watching. "Let me show you how" instead of "I did it for you." After seeing it twice, users do it themselves.

## Why

Every SaaS adding an AI agent faces the same problem: the agent does things programmatically but the user never learns where buttons are or how the UI works. They become dependent on the agent.

The alternative — agents generating UI at runtime — is worse. Generated UI is unpredictable and breaks muscle memory.

**The right pattern**: the agent drives the real UI. It scrolls to the button, spotlights it, pauses so the user sees it, then clicks it. The user watches and learns. Nothing else does this.

## Install

```bash
npm install polter
# peer deps
npm install react react-dom zod
```

## Quick Start

```tsx
import { AgentActionProvider, AgentAction, useAgentAction, useAgentActions } from 'polter';
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

**Programmatic actions** — no UI element, just register the action:

```tsx
useAgentAction({
  name: 'navigate_to_settings',
  description: 'Navigate to settings page',
  onExecute: () => navigate('/settings'),
});

useAgentAction({
  name: 'filter_by_tag',
  description: 'Filter table by tag',
  parameters: z.object({ tag_name: z.string() }),
  onExecute: (p) => setFilter(p.tag_name),
});
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

### 3. Connect to your agent

```tsx
const { schemas, openaiTools, anthropicTools, execute, availableActions, isExecuting } = useAgentActions();

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

1. `<AgentAction>` / `useAgentAction` register actions in a React context on mount, deregister on unmount
2. The registry always reflects exactly what's on screen — schemas auto-generate from Zod parameter definitions
3. `execute(name, params)` looks up the action, finds the DOM element via refs, runs: **scroll into view → dim surroundings → spotlight with pulsing ring → tooltip → pause → click/execute → cleanup**
4. `<div style="display: contents">` wrapper provides DOM refs without affecting layout
5. Components that mount = actions that exist. Navigate away = actions disappear. No manual sync.

## API

### `useAgentAction` vs `<AgentAction>`

| | `useAgentAction` | `<AgentAction>` |
|---|---|---|
| **Use for** | Programmatic actions (navigation, mutations, filters) | Wrapping visible elements (buttons, inputs) |
| **Visual** | No spotlight | Scrolls, spotlights, clicks the wrapped element |
| **Renders** | Nothing | `<div style="display: contents">` around children |

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

## Zero dependencies

Peer deps only: React 18+ and Zod. No runtime dependencies.

## License

MIT
