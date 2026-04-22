# Contributing to Polter

## Prerequisites

- Node.js >= 20
- npm

## Setup

```bash
git clone https://github.com/myDataValue/polter.git
cd polter
npm install
```

## Development

```bash
npm run dev          # watch mode (rebuilds on change)
npm run build        # production build
npm run type-check   # typecheck without emitting
npm test             # run tests
npm run test:watch   # run tests in watch mode
```

## Running the basic example with npm link

To test your local changes against the example app:

```bash
# 1. From the polter root, register the package globally
npm link

# 2. From the example directory, link to your local build
cd examples/basic
npm install
npm link @mydatavalue/polter

# 3. Start the example dev server
npm run dev
```

After linking, any rebuild of polter (`npm run dev` in the root) is picked up by the example app on the next HMR cycle or page refresh.

To unlink when you're done:

```bash
cd examples/basic
npm unlink @mydatavalue/polter
npm install
```
