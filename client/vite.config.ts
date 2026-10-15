import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  /* GitHub Pages serves the client under /Puck/, which the deploy job passes in, while everything else runs at the root */
  base: process.env.BASE_PATH ?? '/',
  resolve: {
    alias: {
      /* Kept in step with the "@/*" mapping in tsconfig.json, or the two disagree */
      '@': path.resolve(__dirname, './src'),
    },
  },
});