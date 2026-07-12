import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (monacoEditorPlugin as any)({ languageWorkers: [] }),
  ],
  root: '.',
  publicDir: 'public',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@dmx-controller/proto': path.resolve(__dirname, 'proto/generated/proto'),
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
    watch: {
      ignored: [
        '**/core/**',
        '**/dist/**',
        '**/src-engine/target/**',
        '**/src-tauri/target/**',
      ],
    },
  },
});
