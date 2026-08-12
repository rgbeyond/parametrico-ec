import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020'
  },
  server: { port: 5173, open: true }
});
