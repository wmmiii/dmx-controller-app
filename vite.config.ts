import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
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
      '@dmx-controller/wasm-engine': path.resolve(__dirname, 'pkg'),
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
    ...(process.env.TAURI_ENV_DEBUG !== 'true' && {
      https: {
        key: path.resolve(__dirname, 'dev/server/server.key'),
        cert: path.resolve(__dirname, 'dev/server/server.crt'),
      },
    }),
    hmr: {
      // Use the correct hostname for HMR WebSocket connections
      // Falls back to the default behavior when running in Tauri
      ...(process.env.TAURI_ENV_DEBUG !== 'true' && {
        host: 'dev.dmx-controller.app',
        protocol: 'wss',
      }),
    },
    watch: {
      ignored: [
        '**/core/**',
        '**/dist/**',
        '**/pkg/**',
        '**/src-engine/target/**',
        '**/src-tauri/target/**',
      ],
    },
  },
});
