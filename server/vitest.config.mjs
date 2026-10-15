import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    /* Named explicitly, so a stray copy of a file elsewhere in the tree is never collected */
    include: ['tests/**/*.test.js'],
    /* Runs the files one after another, so only one in-memory MongoDB server is up at a time */
    fileParallelism: false,
    /* The very first run downloads the MongoDB binary, and that outlasts a normal hook timeout */
    hookTimeout: 120000,
    testTimeout: 20000,
  },
});