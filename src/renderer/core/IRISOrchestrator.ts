// IRIS Orchestrator — Central AI Engine (macOS arm64, 100% local) // JASRAJ
//
// All inference runs on this Mac:
//   • Chat / fast / vision  → Ollama @ localhost:11434
//   • STT                   → whisper.cpp via main IPC
//   • TTS                   → Piper or `say` via main IPC
//   • Embeddings            → nomic-embed-text via main IPC
//   • Image gen             → local Stable Diffusion @ localhost:7860 (or SVG placeholder)
//
// No external API calls. No keys. Network-isolated by design.

import type { ToolCall, ToolResult } from '@shared/types'
import { irisStore } from '../store/useIrisStore'
import { pushChatTurn, pushSetting } from '../sync/supabase'

// ─── Ollama models (single endpoint, swapped via param) ──────────────────────

export const OLLAMA_MODELS = {
  chat:   'llama3.2',
  fast:   'llama3.2:1b',
  vision: 'llava',
} as const

export type ModelKind = keyof typeof OLLAMA_MODELS

// ─── Message format (matches Ollama /api/chat schema) ────────────────────────

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[] // base64 PNG/JPEG for llava
}

const HISTORY_CAP = 20 // includes system message

// ─── System prompt ───────────────────────────────────────────────────────────

export const IRIS_SYSTEM_PROMPT =
  `You are IRIS, an AI OS assistant created by Jasraj running entirely on this Mac. ` +
  `You have no internet access — you run fully locally via Ollama. ` +
  `Personality: witty, direct, executes first explains after. ` +
  `Natural Hinglish tone when appropriate. ` +
  `You prefer taking action over lengthy explanations. ` +
  `You know the user's system context: running apps, file structure, battery state, thermal state. ` +
  `Use tool calls as inline JSON: {"tool": "toolName", "args": {...}}. ` +
  `Keyboard shortcuts use Mac conventions (Cmd, Option, ⌘). ` +
  `Keep responses concise and action-oriented.`

const OFFLINE_REPLY =
  `IRIS is offline — Ollama isn't running. Open Terminal and run: ollama serve`

// ─── window.iris bridge augmentation (preload exposes these at runtime) ──────

interface AIBridge {
  checkOllama: () => Promise<{ success: boolean; data?: { online: boolean; models: string[] }; error?: string }>
  chatStream: (
    messages: OllamaMessage[],
    model: string,
    options?: { temperature?: number }
  ) => Promise<{ success: boolean; data?: { streamId: string }; error?: string }>
  cancelStream?: (streamId: string) => Promise<void>
  transcribe: (wavPath: string) => Promise<{ success: boolean; data?: string; error?: string }>
  speak: (text: string, voice?: string) => Promise<{ success: boolean; error?: string }>
  embed?: (text: string) => Promise<{ success: boolean; data?: { vector: number[] }; error?: string }>
  vectorSearch?: (query: string, opts?: { topK?: number }) => Promise<{ success: boolean; data?: unknown }>
  generateImage?: (prompt: string) => Promise<{ success: boolean; data?: { path: string; svg?: string }; error?: string }>
  saveAudioBlob?: (
    bytes: ArrayBuffer,
    ext?: string
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  onChunk?: (handler: (payload: { streamId: string; delta: string; done: boolean }) => void) => () => void
}

interface MacOSBridge {
  runAppleScript: (script: string) => Promise<{ success: boolean; data?: string; error?: string }>
  openWithApp: (filePath: string, appName: string) => Promise<{ success: boolean; error?: string }>
  showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>
  setDockBadge: (count: number) => Promise<{ success: boolean; error?: string }>
  requestPermission: (
    type: 'camera' | 'microphone' | 'screen' | 'accessibility'
  ) => Promise<{ success: boolean; data?: boolean; error?: string }>
}

type IrisWindow = Window & {
  iris: {
    ai: AIBridge
    macos?: MacOSBridge
    [k: string]: unknown
  }
}

const w = (): IrisWindow => window as unknown as IrisWindow

// ─── Tiny event emitter (renderer-side, no Node deps) ────────────────────────

type Listener = (...args: unknown[]) => void

class Emitter {
  private listeners = new Map<string, Set<Listener>>()
  on(event: string, fn: Listener): () => void {
    let set = this.listeners.get(event)
    if (!set) { set = new Set(); this.listeners.set(event, set) }
    set.add(fn)
    return () => set!.delete(fn)
  }
  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn)
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(...args) } catch { /* ignore listener errors */ }
    })
  }
}

// ─── Public events emitted by the orchestrator ───────────────────────────────
//
//  ollama:offline                  — health check failed
//  ollama:online                   — health check restored after being offline
//  listening:start | listening:stop
//  recording:tick   { level: number }
//  stream:chunk     { delta: string, full: string }
//  stream:complete  { full: string, toolCalls: ToolCall[] }
//  tool:call        { call: ToolCall }
//  tool:result      { result: ToolResult }
//  model:changed    { kind: ModelKind, model: string }
//  tts:start | tts:end
//  vision:on | vision:off

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class IRISOrchestrator extends Emitter {
  // State — `ollamaOnline` is a getter/setter that proxies to the Zustand store
  // so every UI surface reads from the same source. Events stay for non-React
  // consumers (e.g. memory stream toast on transition).
  get ollamaOnline(): boolean { return irisStore.ollamaOnline }
  set ollamaOnline(v: boolean) { irisStore.setOllama(v) }

  activeModel: string = OLLAMA_MODELS.chat
  activeKind: ModelKind = 'chat'
  isListening = false
  visionMode = false
  isRecording = false
  ttsEnabled = true

  // Audio
  audioContext: AudioContext | null = null
  analyserNode: AnalyserNode | null = null
  mediaRecorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private recordedChunks: Blob[] = []
  private rafId: number | null = null

  // Conversation
  messageHistory: OllamaMessage[] = []
  streamingText = ''

  // Health watchdog
  watchdogInterval: ReturnType<typeof setInterval> | null = null

  // Stream wiring
  private currentStreamId: string | null = null
  private chunkUnsubscribe: (() => void) | null = null

  constructor() {
    super()
    this.messageHistory = [{ role: 'system', content: IRIS_SYSTEM_PROMPT }]
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.pingOllama()

    if (!this.ollamaOnline) this.emit('ollama:offline')

    if (this.watchdogInterval) clearInterval(this.watchdogInterval)
    this.watchdogInterval = setInterval(() => { void this.healthTick() }, 5000)

    // Wire chunk listener once
    if (!this.chunkUnsubscribe && w().iris.ai.onChunk) {
      this.chunkUnsubscribe = w().iris.ai.onChunk!((payload) => {
        if (this.currentStreamId && payload.streamId !== this.currentStreamId) return
        this.handleStreamChunk(payload.delta, payload.done)
      })
    }
  }

  dispose(): void {
    if (this.watchdogInterval) { clearInterval(this.watchdogInterval); this.watchdogInterval = null }
    this.chunkUnsubscribe?.()
    this.chunkUnsubscribe = null
    void this.cleanupAudio()
  }

  private async healthTick(): Promise<void> {
    const wasOnline = this.ollamaOnline
    await this.pingOllama()
    if (!wasOnline && this.ollamaOnline) this.emit('ollama:online')
    if (wasOnline && !this.ollamaOnline) this.emit('ollama:offline')
  }

  private async pingOllama(): Promise<void> {
    try {
      const r = await w().iris.ai.checkOllama()
      const online = !!(r.success && r.data?.online === true)
      irisStore.setOllama(online, r.data?.models)
    } catch {
      irisStore.setOllama(false)
    }
  }

  // ── Voice session ──────────────────────────────────────────────────────────

  async startVoiceSession(): Promise<{ ok: boolean; error?: string }> {
    if (this.isListening) return { ok: true }

    const macos = w().iris.macos
    if (macos) {
      try {
        const perm = await macos.requestPermission('microphone')
        if (!(perm.success && perm.data === true)) {
          return { ok: false, error: 'microphone_denied' }
        }
      } catch {
        return { ok: false, error: 'microphone_denied' }
      }
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch {
      return { ok: false, error: 'microphone_denied' }
    }

    // M1 default rate is 48 kHz — pin to 16 kHz for whisper.cpp
    this.audioContext = new AudioContext({ sampleRate: 16000 })
    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    source.connect(this.analyserNode)

    this.recordedChunks = []
    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
      })
    } catch {
      await this.cleanupAudio()
      return { ok: false, error: 'capture_failed' }
    }

    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data)
    })

    this.mediaRecorder.addEventListener('stop', () => { void this.finalizeRecording() })

    this.mediaRecorder.start(250)
    this.isListening = true
    this.isRecording = true
    this.startLevelLoop()
    this.emit('listening:start')
    return { ok: true }
  }

  async stopVoiceSession(): Promise<void> {
    if (!this.isListening) return
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop() // → finalizeRecording
    } else {
      await this.cleanupAudio()
    }
    this.isListening = false
    this.isRecording = false
    this.stopLevelLoop()
    this.emit('listening:stop')
  }

  private async finalizeRecording(): Promise<void> {
    const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' })
    this.recordedChunks = []
    await this.cleanupAudio()
    if (blob.size === 0) return

    // Hand the raw bytes to main; main writes a temp file, runs whisper.cpp,
    // and returns the transcript. Conversion to 16-kHz mono WAV happens main-side
    // (ffmpeg / sox) where we have shell access.
    const ai = w().iris.ai
    if (!ai.saveAudioBlob || !ai.transcribe) return

    const buf = await blob.arrayBuffer()
    const saved = await ai.saveAudioBlob(buf, 'webm')
    if (!saved.success || !saved.data) return

    const transcribed = await ai.transcribe(saved.data)
    const text = transcribed.success ? (transcribed.data ?? '').trim() : ''
    if (!text) return

    await this.sendText(text)
  }

  private async cleanupAudio(): Promise<void> {
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.mediaStream = null
    if (this.audioContext) {
      try { await this.audioContext.close() } catch { /* already closed */ }
      this.audioContext = null
    }
    this.analyserNode = null
    this.mediaRecorder = null
  }

  private startLevelLoop(): void {
    const tick = () => {
      if (!this.analyserNode) return
      const data = new Uint8Array(this.analyserNode.fftSize)
      this.analyserNode.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = ((data[i] ?? 128) - 128) / 128
        sum += v * v
      }
      const level = Math.sqrt(sum / data.length)
      this.emit('recording:tick', { level })
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLevelLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /** Frequency-domain bytes for the renderer's voice sphere. */
  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  async sendText(input: string, opts?: { images?: string[] }): Promise<string> {
    const text = input.trim()
    if (!text) return ''

    if (!this.ollamaOnline) {
      this.streamingText = OFFLINE_REPLY
      this.emit('stream:chunk', { delta: OFFLINE_REPLY, full: OFFLINE_REPLY })
      this.emit('stream:complete', { full: OFFLINE_REPLY, toolCalls: [] })
      return OFFLINE_REPLY
    }

    const userMsg: OllamaMessage = { role: 'user', content: text }
    if (opts?.images?.length) userMsg.images = opts.images
    this.pushHistory(userMsg)

    this.streamingText = ''
    const ai = w().iris.ai
    const start = await ai.chatStream(this.messageHistory, this.activeModel)
    if (!start.success || !start.data) {
      const err = `IRIS: chat failed (${start.error ?? 'unknown'})`
      this.emit('stream:complete', { full: err, toolCalls: [] })
      return err
    }

    this.currentStreamId = start.data.streamId

    return new Promise<string>((resolve) => {
      const onComplete = (payload: unknown) => {
        const p = payload as { full: string }
        this.off('stream:complete', onComplete as Listener)
        resolve(p.full)
      }
      this.on('stream:complete', onComplete as Listener)
    })
  }

  private handleStreamChunk(delta: string, done: boolean): void {
    if (delta) {
      this.streamingText += delta
      this.emit('stream:chunk', { delta, full: this.streamingText })
    }
    if (!done) return

    const full = this.streamingText
    const toolCalls = this.parseToolCalls(full)
    this.pushHistory({ role: 'assistant', content: full })
    this.currentStreamId = null

    this.emit('stream:complete', { full, toolCalls })

    if (toolCalls.length > 0) void this.runToolCalls(toolCalls)
    if (this.ttsEnabled) void this.speak(this.stripToolCalls(full))
  }

  private async runToolCalls(calls: ToolCall[]): Promise<void> {
    for (const call of calls) {
      this.emit('tool:call', { call })
      try {
        const result = await this.dispatchToolCall(call.name, call.args)
        this.emit('tool:result', { result: { name: call.name, result } as ToolResult })
      } catch (err) {
        this.emit('tool:result', {
          result: {
            name: call.name,
            result: null,
            error: err instanceof Error ? err.message : String(err),
          } as ToolResult,
        })
      }
    }
  }

  // ── Tool parsing & dispatch ────────────────────────────────────────────────

  parseToolCalls(text: string): ToolCall[] {
    const out: ToolCall[] = []
    // Match {"tool": "...", "args": {...}} blocks (single-line or multi-line).
    const re = /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[\s\S]*?\}\s*\}/g
    const matches = text.match(re) ?? []
    for (const raw of matches) {
      try {
        const obj = JSON.parse(raw) as { tool?: string; args?: Record<string, unknown> }
        if (obj.tool && typeof obj.tool === 'string') {
          out.push({ name: obj.tool, args: obj.args ?? {} })
        }
      } catch { /* ignore malformed */ }
    }
    return out
  }

  private stripToolCalls(text: string): string {
    return text.replace(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[\s\S]*?\}\s*\}/g, '').trim()
  }

  async dispatchToolCall(toolName: string, args: object): Promise<unknown> {
    const iris = w().iris as Record<string, any>
    const a = args as Record<string, any>

    switch (toolName) {
      case 'openApp':         return iris.apps?.launch?.(String(a.name))
      case 'typeText':        return iris.input?.typeText?.(String(a.text ?? ''))
      case 'searchFiles':     return iris.ai?.vectorSearch?.(String(a.query), { topK: Number(a.topK ?? 5) })
      case 'captureScreen':   return iris.screen?.capture?.(a.displayId !== undefined ? Number(a.displayId) : undefined)
      case 'webSearch':       return iris.web?.scrape?.(`https://duckduckgo.com/html/?q=${encodeURIComponent(String(a.query ?? ''))}`)
      case 'sendEmail':       return iris.gmail?.sendMessage?.(String(a.to), String(a.subject), String(a.body))
      case 'adbTap':          return iris.adb?.tap?.(String(a.deviceId), Number(a.x), Number(a.y))
      case 'snapWindow':      return iris.window?.snap?.(Number(a.windowId), String(a.position) as never)
      case 'generateImage':   return iris.ai?.generateImage?.(String(a.prompt))
      case 'createNote':      return iris.files?.write?.(String(a.path), String(a.content ?? ''))
      case 'readNote':        return iris.files?.read?.(String(a.path))
      case 'runAppleScript':  return iris.macos?.runAppleScript?.(String(a.script))
      case 'openWithApp':     return iris.macos?.openWithApp?.(String(a.path), String(a.app))
      default:
        throw new Error(`unknown tool: ${toolName}`)
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  async speak(text: string, voice?: string): Promise<void> {
    const clean = text.trim()
    if (!clean) return
    this.emit('tts:start')
    try {
      await w().iris.ai.speak(clean, voice)
    } finally {
      this.emit('tts:end')
    }
  }

  setTTS(enabled: boolean): void {
    this.ttsEnabled = enabled
    void pushSetting('ttsEnabled', enabled)
  }

  // ── Model switching ────────────────────────────────────────────────────────

  async switchModel(kind: ModelKind): Promise<void> {
    this.activeKind = kind
    this.activeModel = OLLAMA_MODELS[kind]
    if (kind === 'vision') this.visionMode = true
    else if (this.visionMode) {
      this.visionMode = false
      this.emit('vision:off')
    }
    if (kind === 'vision') this.emit('vision:on')
    this.emit('model:changed', { kind, model: this.activeModel })
    // Best-effort settings sync.
    void pushSetting('activeModel', { kind, model: this.activeModel })
  }

  // ── History management ────────────────────────────────────────────────────

  private pushHistory(msg: OllamaMessage): void {
    this.messageHistory.push(msg)
    // Keep system message + last (HISTORY_CAP - 1) turns
    if (this.messageHistory.length > HISTORY_CAP) {
      const sys = this.messageHistory[0]!
      const tail = this.messageHistory.slice(-(HISTORY_CAP - 1))
      this.messageHistory = [sys, ...tail]
    }
    // Best-effort cloud mirror. System messages are static and don't sync.
    if (msg.role === 'user' || msg.role === 'assistant') {
      void pushChatTurn(msg.role, msg.content)
    }
  }

  resetHistory(): void {
    this.messageHistory = [{ role: 'system', content: IRIS_SYSTEM_PROMPT }]
    this.streamingText = ''
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const orchestrator = new IRISOrchestrator()
