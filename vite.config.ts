/// <reference types="vitest" />
import { defineConfig } from 'vite';

// `base: './'` keeps every asset URL relative, so the build works both at the
// domain root and under a GitHub Pages sub-path (e.g. /MGUK-KERS-Simulator/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // Pure-logic tests run in Node. UI tests opt into a DOM with the per-file
    // pragma `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
