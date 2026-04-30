<p align="center">
  <img src="logo.svg?raw=true" alt="Polter" width="200" />
</p>

<h1 align="center">polter</h1>

<p align="center">Drop an AI agent into your complex B2B dashboard — without rebuilding your UI as agent tools.</p>

<p align="center"><em>The AI assistant on the right sends a single sentence — Polter drives every click on the left.</em></p>

<p align="center">
  <img src="https://github.com/myDataValue/polter/raw/main/docs/polter.gif" alt="Polter demo" width="800" />
</p>

<p align="center">
  <a href="https://stackblitz.com/github/myDataValue/polter/tree/main/examples/basic"><strong>▶ Try it on StackBlitz</strong></a>
  ·
  <a href="https://mydatavalue.github.io/polter/">Website</a>
</p>

Your UI *is* the agent's interface. Same buttons, same dropdowns, same forms
your users already click — single source of truth, zero duplicate tool layer. As
a side effect, users watch the agent work and graduate off it for tasks they've
seen once or twice.

## Agent-Driven UI (ADUI)

Generative UI generates new interfaces on the fly. **Agent-Driven UI drives the
one you already built.** Vercel's Generative UI is great for chatbots. ADUI is
how you bring agents into complex B2B apps — CRMs, ERPs, PMSes, admin panels —
without duplicating your UI as a parallel tool layer.

## Why

If you're adding an AI agent to a complex dashboard — a CRM, an ERP, a PMS, an
admin panel, anywhere users manage 100s of things across tables, forms, and
modals — you hit the same wall.

**The duplicate tool layer.** You already built the table, the filters, the
bulk-edit modal, the per-row actions. Now the agent needs to do the same things
— so you're writing a parallel set of API endpoints, tool schemas, and handlers
that re-implement your UI in JSON. Every feature ships twice, and the two layers
drift apart.

**Polter's approach: your UI *is* the agent's interface.** The agent scrolls to
the real button, opens the real dropdown, clicks the real row. One mount, one
schema, one click path — zero agent-specific tools to build.

As a side effect, because the user watches the agent work, they pick up the
interface and graduate off the agent for tasks they've seen once or twice.
Permanent dependency isn't part of the deal.

## Install

```bash
npm install polter
# peer deps
npm install react react-dom zod
```

## Quick Start

```tsx
import { AgentActionProvider, AgentAction, AgentTarget, useAgentAction, useAgentActions } from 'polter';
import { z } from 'zod';
```

### 1. Wrap your app

```tsx
<AgentActionProvider mode="guided" stepDelay={600}>
  <App />
</AgentActionProvider>
```

### 2. Register actions

**Simple actions** — define with `defineAction`, then wrap a single element with `<AgentAction>`:

```tsx
// actions.ts
const exportData = defineAction({
  name: 'export_data',
  description: 'Export the current view to CSV',
});

// Component
<AgentAction action={exportData}>
  <ExportButton />
</AgentAction>
```

**Multi-step and parameterized actions** — use the `useAgentAction` hook with a
steps array and `<AgentTarget>` on the DOM elements. Steps can declare `skipIf`
predicates that check current state, so only the interactions still needed
actually fire:

```tsx
// Component
useAgentAction(
  defineAction({
    name: 'filter_and_export',
    description: 'Filter items by status and export',
    parameters: z.object({
      status: z.enum(['all', 'active', 'archived']),
    }),
    steps: [
      { label: 'Open filter', target: 'status-toggle',
        skipIf: ({ status }) => statusFilter === status || dropdownOpen },
      { label: 'Pick status', target: (p) => `status:${p.status}`,
        skipIf: ({ status }) => statusFilter === status },
      { label: 'Click export', target: 'export-btn' },
    ],
  }),
);
```

See [best practices](docs/best-practices.md) for patterns around `skipIf`,
`value`/`fromParam`, modal interactions, Radix integration, and more.

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

1. `<AgentAction>` or `useAgentAction` registers actions in a React context on
   mount, deregisters on unmount
2. The registry always reflects exactly what's on screen — schemas auto-generate
   from Zod parameter definitions
3. `execute(name, params)` looks up the action, evaluates `skipIf` on each step,
   then for active steps runs: **scroll into view → dim surroundings → spotlight
   with pulsing ring → tooltip → pause → click/type/execute → cleanup**
4. `<div style="display: contents">` wrapper provides DOM refs without affecting
   layout
5. Components that mount = actions that exist. Navigate away = actions
   disappear. No manual sync.

## Advanced: `defineAction()` + Registry

For multi-page apps, `<AgentAction>` schemas are only available when the
component is mounted. If the user says "edit item 42" but that page isn't open,
the agent can't see the action.

`defineAction()` solves this — schemas are available at import time, before any
component mounts. Combined with the `registry` prop, the agent gets full
knowledge of every action upfront (single LLM roundtrip).

### 1. Define actions (co-located with your feature)

```tsx
// features/items/actions.ts
import { defineAction } from 'polter';
import { z } from 'zod';

export const editItem = defineAction({
  name: 'edit_item',
  description: 'Edit an item',
  parameters: z.object({
    item_id: z.string(),
  }),
  route: (p) => `/items/${p.item_id}/edit`,
});
```

### 2. Create a registry (barrel file)

```tsx
// registry.ts
import { editItem } from './features/items/actions';
import { exportData } from './features/reports/actions';

export const agentRegistry = [editItem, exportData];
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
// features/items/EditPage.tsx
import { editItem } from './actions';

<AgentAction action={editItem}>
  <EditButton />
</AgentAction>
```

### How it works

1. On mount, the provider registers all registry actions as schema-only entries
   — the agent sees them immediately
2. When the agent calls `execute('edit_item', { item_id: '42' })`:
   - Provider calculates the route: `/items/42/edit`
   - Calls your `navigate()` function
   - Waits for the `<AgentAction>` component to mount on the new page
   - Runs the visual execution (spotlight, click, etc.)
3. When the component unmounts (user navigates away), the action reverts to
   schema-only — never disappears from the agent's view

**Cross-page actions** — use `steps` on `defineAction` for steps that cross page
boundaries. The executor polls up to 5s for each step's target to appear.
For targets behind slow API calls, render them with `disabled` during loading —
polter polls past disabled elements and clicks when they become enabled:

```ts
export const grantAccess = defineAction({
  name: 'grant_access',
  description: 'Grant bot access to properties',
  steps: [
    { label: 'Click Settings', target: 'settings-tab' },
    { label: 'Click Grant Access', target: 'grant-link' },
  ],
});
```

If an action's last step triggers async work (a mutation, a streaming response),
use `waitFor` on the component or hook to hold the action open until it
completes. Pass a React ref (safe — can't do work in a ref) or a function
(escape hatch for custom promise construction).

## API

### Execution modes

| Mode | Behavior | Use case |
|------|----------|----------|
| `"guided"` | Scroll → spotlight → pause → click | Teaching users, first-time flows |
| `"instant"` | Execute immediately, no visual[^wip] | Power users, repeat actions |

[^wip]: `instant` mode is a work in progress — it currently clicks elements but
    does not yet support all interaction types (e.g. typing simulation,
    programmatic value setting).

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
| `devWarnings` | `boolean` | `false` |

### Disabled actions

```tsx
<AgentAction
  action={saveChanges}
  disabled={!hasUnsavedChanges}
  disabledReason="No unsaved changes"
>
  <SaveButton />
</AgentAction>
```

Disabled actions appear in `availableActions` but are excluded from `schemas`.
Calling `execute()` on a disabled action returns `{ success: false, error: "No
unsaved changes" }`.

### CSS customization

All overlay elements have class names:

```css
.polter-spotlight { /* box-shadow overlay with cutout */ }
.polter-ring { /* pulsing border around target */ }
.polter-tooltip { /* label tooltip */ }
```

## Best practices

See [docs/best-practices.md](docs/best-practices.md) for patterns around
`skipIf`, `value`/`fromParam`, conditional rendering, per-row actions, modal
interactions, Radix integration, and more.

## Zero dependencies

Peer deps only: React 18+ and Zod. No runtime dependencies.

## License

MIT
