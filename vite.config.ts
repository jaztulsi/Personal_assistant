import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Vite root is the renderer (src/renderer), so vite-plugin-electron entry paths
// MUST be absolute — otherwise they'd resolve to src/renderer/src/main/...

const projectRoot = __dirname
const fromRoot = (...p: string[]) => resolve(projectRoot, ...p)

/**
 * Project-wide `"type": "module"` makes Node parse .js as ESM. Preload runs
 * as CJS (it must be sync, and Electron preload doesn't support ESM yet), so
 * we drop a tiny `package.json` with `{"type":"commonjs"}` into the preload
 * output dir to scope-override Node's interpretation. Main is ESM and needs
 * no shim.
 */
function writeCjsScope(outDir: string): Plugin {
  return {
    name: `iris:cjs-scope-${outDir}`,
    apply: () => true,
    closeBundle() {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        resolve(outDir, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      // ── Main process ───────────────────────────────────────────────────
      {
        entry: fromRoot('src/main/index.ts'),
        onstart({ startup }) {
          // Launch Electron once main is built (and reload it on subsequent
          // rebuilds). Without this, dev would only serve the renderer.
          startup()
        },
        vite: {
          resolve: {
            alias: {
              '@main':    fromRoot('src/main'),
              '@shared':  fromRoot('src/shared'),
              '@preload': fromRoot('src/preload'),
            },
          },
          build: {
            sourcemap: true,
            outDir: fromRoot('dist/main'),
            emptyOutDir: true,
            // With "type": "module" at the project root, vite-plugin-electron
            // bundles main as ESM. Electron 33 supports ESM main, but Node
            // ESM has no __dirname — see import.meta.url polyfill in
            // src/main/index.ts.
            rollupOptions: {
              external: [
                'electron',
                'fs', 'path', 'os', 'child_process', 'crypto',
                'stream', 'util', 'events', 'net', 'http', 'https', 'url',
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
                'bcryptjs',
              ],
            },
          },
        },
      },

      // ── Preload ────────────────────────────────────────────────────────
      {
        entry: fromRoot('src/preload/index.ts'),
        onstart({ reload }) {
          reload()
        },
        vite: {
          plugins: [writeCjsScope(fromRoot('dist/preload'))],
          resolve: {
            alias: {
              '@shared':  fromRoot('src/shared'),
              '@preload': fromRoot('src/preload'),
            },
          },
          build: {
            sourcemap: true,
            outDir: fromRoot('dist/preload'),
            emptyOutDir: true,
            // Preload defaults to CJS in vite-plugin-electron. The CJS-scope
            // package.json shim above makes Node treat its .js as CJS even
            // under root "type": "module".
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],

  resolve: {
    alias: {
      '@main':     fromRoot('src/main'),
      '@renderer': fromRoot('src/renderer'),
      '@shared':   fromRoot('src/shared'),
      '@preload':  fromRoot('src/preload'),
    },
  },

  // Renderer config
  root: fromRoot('src/renderer'),
  publicDir: fromRoot('public'),
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: fromRoot('dist/renderer'),
    emptyOutDir: true,
  },
})
