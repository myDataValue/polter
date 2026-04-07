# Polter Basic Example

A minimal example showing polter driving a fake CRM dashboard. Click a suggestion in the AI Assistant panel and watch the agent spotlight, click, and type into the real UI.

## Try it instantly

- **StackBlitz**: https://stackblitz.com/github/myDataValue/polter/tree/master/examples/basic
- **CodeSandbox**: https://codesandbox.io/p/github/myDataValue/polter/master?import=true&workspace=examples/basic

## Run locally

```bash
npm install
npm run dev
```

## What it shows

- **Single-click action** — Export CSV button
- **Multi-step action** — Status filter (open dropdown, click option)
- **Typing simulation** — Search box (agent types character-by-character)
- **Parameterized action** — Filter by enum value
- **No real LLM needed** — A "fake agent" panel triggers actions on click
