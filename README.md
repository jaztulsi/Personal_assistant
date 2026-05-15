<div align="center">

# IRIS

**Intelligent Runtime Interface System** &nbsp;`// JASRAJ`

A local-first AI OS assistant for macOS — voice, vision, and full system control,
running entirely on your machine. No API keys. No cloud. Network-isolated by design.

`Apple Silicon (arm64)` · `Electron 33` · `React 19` · `100% on-device inference`

</div>

---

## What it is

IRIS is a desktop assistant that lives on your Mac and can actually *operate* it —
read and write files, launch and control apps, drive the keyboard and mouse, capture
the screen, talk to connected Android devices, and hold a conversation by voice or
text. Every model runs locally:

| Capability      | Engine                                  |
| --------------- | --------------------------------------- |
| Chat / reasoning | Ollama — `llama3.2`                    |
| Fast replies    | Ollama — `llama3.2:1b`                  |
| Vision          | Ollama — `llava`                        |
| Speech-to-text  | `whisper.cpp` (via main process)        |
| Text-to-speech  | Piper / macOS `say`                     |
| Embeddings      | `nomic-embed-text`                      |

Nothing leaves the device — including biometric data used to unlock it.

## Highlights

- **Local-only inference** — talks to Ollama on `localhost:11434`; works fully offline.
- **Biometric lock screen** — Touch ID → on-device face recognition → PIN fallback.
  Face descriptors never leave the machine.
- **Voice-reactive particle sphere** — a 2,000-point Fibonacci sphere (three.js /
  @react-three/fiber) that pulses and shifts emerald→cyan with your voice.
- **System-aware HUD** — live efficiency/performance core split, unified memory,
  thermal state, battery, and Ollama round-trip latency.
- **Deep macOS integration** — files, app control, input automation, screen capture,
  ADB bridge, and Gmail/web tools, all behind a context-isolated IPC bridge.

## Stack

Electron 33 · React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 3.4 ·
three.js + @react-three/fiber 9 · Framer Motion · GSAP · Ollama

## Prerequisites

- macOS on Apple Silicon (arm64)
- Node.js 22+
- [Ollama](https://ollama.com) running locally, with the models pulled:
  ```bash
  ollama pull llama3.2
  ollama pull llama3.2:1b
  ollama pull llava
  ```

## Getting started

```bash
# install (the dependency tree needs legacy peer resolution)
npm install --legacy-peer-deps

# launch IRIS as a desktop app (Vite + Electron main + preload, hot-reloaded)
npm run dev
```

On first launch you'll create a PIN and optionally enrol your face; after that the
lock screen guards the app and unlocking drops you into the dashboard.

## Scripts

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Build main + preload, start Vite, open the Electron window |
| `npm run build`    | Type-check then build all three processes                 |
| `npm run typecheck`| `tsc --noEmit`                                            |
| `npm run pack`     | Package an unsigned `.app` with electron-builder           |
| `npm run dist`     | Build + package a distributable                            |

## Architecture

```
src/
├── main/                  Electron main process
│   ├── index.ts           App lifecycle, window, macOS permission prompts
│   └── ipc/handlers/      One handler per capability:
│                          files · apps · input · window · screen · adb
│                          gmail · web · system · store · ai · auth · macos
├── preload/               Context-isolated bridge → exposes `window.iris`
├── renderer/              React UI
│   ├── screens/           SetupScreen, LockScreen
│   ├── pages/             Dashboard
│   ├── components/        ParticleSphere, ChatSidebar, SystemStats,
│   │                      MicButton, OllamaStatus
│   └── core/              IRISOrchestrator (local AI engine), FaceAuth
└── shared/                Types shared across processes
```

- **Main** is an ES module; `__dirname` is polyfilled from `import.meta.url`.
- **Preload** is emitted as `index.mjs` so Electron loads it as an ES Module, and
  exposes a single namespaced `window.iris` object via `contextBridge`.
- **Renderer** routes with `HashRouter` (Electron `file://` friendly):
  `/setup` → `/lock` → `/dashboard`.
- **IRISOrchestrator** is the renderer-side singleton that owns Ollama health,
  voice sessions, model switching, and streaming.

## Privacy

IRIS makes no external API calls and holds no keys. All inference is local via
Ollama, and biometric/face data is stored and matched on-device only — it never
touches a network.

---

<div align="center"><sub>Built by Jasraj · runs only where you run it</sub></div>
