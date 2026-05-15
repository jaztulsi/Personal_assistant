import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync } from 'fs'
import { resolve } from 'path'

// Vite root is the renderer (src/renderer), so vite-plugin-electron entry paths
// MUST be absolute — otherwise they'd resolve to src/renderer/src/main/...

const projectRoot = __dirname
const fromRoot = (...p: string[]) => resolve(projectRoot, ...p)

/**
 * Project-wide `"type": "module"` makes vite-plugin-electron emit ESM for
 * every target (it keys off the root package.json `type`). Electron only
 * loads a preload script as ESM when the file ends in `.mjs` — a `.js`
 * preload is always parsed as CommonJS and chokes on `import`. So we rename
 * the emitted preload bundle `index.js` → `index.mjs` after the build and
 * fix up its sourcemap pointer. Main is ESM too and needs no rename.
 */
function renameToMjs(outDir: string): Plugin {
  return {
    name: `iris:rename-mjs-${outDir}`,
    apply: () => true,
    closeBundle() {
      const js = resolve(outDir, 'index.js')
      if (existsSync(js)) {
        const code = readFileSync(js, 'utf8').replace('index.js.map', 'index.mjs.map')
        writeFileSync(resolve(outDir, 'index.mjs'), code)
        rmSync(js)
      }
      const map = resolve(outDir, 'index.js.map')
      if (existsSync(map)) renameSync(map, resolve(outDir, 'index.mjs.map'))
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
          // --remote-debugging-port lets us inspect the renderer console.
          startup(['.', '--no-sandbox', '--remote-debugging-port=9222'])
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
          plugins: [renameToMjs(fromRoot('dist/preload'))],
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
            // Emitted as ESM index.js, then renamed to index.mjs by the
            // renameToMjs plugin so Electron loads it as an ES Module.
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
