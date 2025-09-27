import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  base: process.env.NODE_ENV === 'production' ? '/dmx-controller/' : '/',
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
    https: {
      key: path.resolve(__dirname, 'dev/server/server.key'),
      cert: path.resolve(__dirname, 'dev/server/server.crt'),
    },
  },
});
