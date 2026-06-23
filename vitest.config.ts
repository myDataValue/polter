import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    // v8 provider → statement + branch coverage (full path coverage isn't
    // offered by JS tooling). text for local runs, json-summary for the
    // in-CI total, cobertura for tooling/artifacts.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'cobertura'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: [
        'src/__tests__/**',
        '**/*.d.ts',
        // Pure re-export barrel — no logic to cover.
        'src/index.ts',
      ],
    },
  },
});
