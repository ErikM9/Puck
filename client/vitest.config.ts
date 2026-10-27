import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /* Vitest reads this file instead of vite.config without merging the two, so the alias is repeated here */
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    /* describe, it and expect are available without importing them into every suite */
    globals: true,
    setupFiles: './src/test/setup.ts',
    /* Scoped to src, or the default pattern sweeps up the Playwright specs in e2e */
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /* Component tests check structure and behaviour, so the stylesheet is never needed */
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      /* Named explicitly, or the report counts the specs themselves and flatters the total */
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      /* Set a few points under the current figures, so ordinary churn passes and a real regression does not */
      thresholds: {
        statements: 97,
        branches: 89,
        functions: 97,
        lines: 97,
      },
    },
  },
});