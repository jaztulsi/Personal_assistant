import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist/main',
            rollupOptions: {
              external: [
                'electron',
                'fs',
                'path',
                'os',
                'child_process',
                'crypto',
                'stream',
                'util',
                'events',
                'net',
                'http',
                'https',
                'url',
                '@nut-tree/nut-js',
                'node-window-manager',
                'chokidar',
                'tesseract.js',
                'puppeteer-core',
                'googleapis',
                '@devicefarmer/adbkit',
                'electron-store',
                'vectordb',
                '@xenova/transformers',
                'systeminformation',
              ],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist/preload',
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@preload': resolve(__dirname, 'src/preload'),
    },
  },
  define: {
    'process.platform': '"darwin"',
  },
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
})
