import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { resolve } from 'path'

// Multi-page Vite build. Each Tauri window loads its own HTML entry,
// keeping per-module JS isolated (Comtor doesn't pay for open-sesame's
// bundle weight and vice versa).
//
// To add a new module:
//   1. Drop modules/<id>/frontend/index.html + src/
//   2. Register the entry in `rollupOptions.input` below
//   3. Mirror in src/modules/registry.ts + src-tauri/src/module_registry.rs
//   4. Add a per-window capability file in src-tauri/capabilities/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5180,
    strictPort: true,
    host: '127.0.0.1',
    fs: {
      // Allow Vite to serve files outside of apps/launcher (module code,
      // shared packages all live higher up in the monorepo).
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, '../../modules'),
      '@desk-launcher/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@desk-launcher/tauri-bridge': path.resolve(__dirname, '../../packages/tauri-bridge/src'),
      // Module-internal aliases — each module gets its own short prefix so
      // its existing `@/` imports can be sed'd to `@<module>/` without
      // colliding with the launcher's own `@/` alias.
      '@os': path.resolve(__dirname, '../../modules/open-sesame/frontend/src'),
      '@cmt': path.resolve(__dirname, '../../modules/comtor/frontend/src'),
      '@vid': path.resolve(__dirname, '../../modules/video-downloader/frontend/src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        launcher: resolve(__dirname, 'index.html'),
        'port-killer': resolve(__dirname, 'modules-pages/port-killer/index.html'),
        'open-sesame': resolve(__dirname, 'modules-pages/open-sesame/index.html'),
        comtor: resolve(__dirname, 'modules-pages/comtor/index.html'),
        'video-downloader': resolve(__dirname, 'modules-pages/video-downloader/index.html'),
      },
    },
  },
})
