# Contributing to Polter

## Prerequisites

- Node.js >= 20
- pnpm (enable with `corepack enable`, or see https://pnpm.io/installation)

## Setup

```bash
git clone https://github.com/myDataValue/polter.git
cd polter
pnpm install
```

## Development

```bash
pnpm dev          # watch mode (rebuilds on change)
pnpm build        # production build
pnpm type-check   # typecheck without emitting
pnpm test         # run tests
pnpm test:watch   # run tests in watch mode
```

## Running the basic example with a global link

To test your local changes against the example app:

```bash
# 1. From the polter root, build and register the package globally
pnpm build
pnpm link --global

# 2. From the example directory, link to your local build
cd examples/basic
pnpm install
pnpm link --global @mydatavalue/polter

# 3. Start the example dev server
pnpm dev
```

After linking, any rebuild of polter (`pnpm dev` in the root) is picked up by
the example app on the next HMR cycle or page refresh.

To unlink when you're done:

```bash
cd examples/basic
pnpm unlink @mydatavalue/polter
pnpm install
```
