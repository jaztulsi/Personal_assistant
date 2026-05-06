import type { MacOSPermissions, ToolCall, ToolResult } from '../../shared/types'

// IRIS Orchestrator — Central AI Voice Engine // JASRAJ

const IRIS_SYSTEM_PROMPT = `You are IRIS — an AI OS assistant for macOS, created by Jasraj.

Personality: witty, direct, executes first explains after. Natural Hinglish tone when appropriate ("Haan bhai, done." / "Chal, let me check that."). You prefer action over discussion.

You are aware of system context: which apps are running, Spotlight-indexed files, M1/M2/M3 thermal state, battery level, screen state. You use AppleScript and macOS APIs natively.

Tool calls use JSON format: {"tool": "toolName", "args": {...}}

Available tools:
- readFile(path): Read a file
- writeFile(path, content): Write to a file
- listFiles(dir): List directory contents
- searchFiles(dir, query): Search for files
- trashFile(path): Move to Trash
- launchApp(name): Launch macOS app
- killApp(pid): Kill process
- getRunningApps(): List running processes
- typeText(text): Type text (ghost typing with human-like delays)
- click(x, y): Click at coordinates
- shortcut(keys): Execute keyboard shortcut (use Cmd not Ctrl, Option not Alt)
- moveMouse(x, y): Move mouse with bezier curve
- snapWindow(windowId, position): Snap window to position
- captureScreen(): Screenshot
- ocrScreen(imageBase64): OCR on screenshot
- runAppleScript(script): Execute AppleScript for deep macOS automation
- openWithApp(filePath, appName): Open file with specific macOS app
- setDockBadge(count): Update Dock icon badge
- focusApp(appName): Bring macOS app to foreground
- getClipboard(): Read clipboard
- setClipboard(text): Write to clipboard
- showMacNotification(title, body): Show notification
- webSearch(query): Search the web
- scrapeUrl(url): Scrape webpage content
- getCpuUsage(): CPU metrics with E-core/P-core breakdown
- getRamUsage(): Memory usage
- getBatteryInfo(): Battery state
- getThermalState(): Thermal throttle status
- embed(text): Generate embedding vector
- vectorSearch(query): Semantic search over indexed files

Keep responses concise. Use Mac keyboard conventions. When executing tasks, prefer tool calls over explanations.`

const TOOL_SCHEMAS: ToolDefinition[] = [
  { name: 'readFile', description: 'Read file contents', params: { path: 'string' } },
  { name: 'writeFile', description: 'Write content to file', params: { path: 'string', content: 'string' } },
  { name: 'listFiles', description: 'List directory contents', params: { dir: 'string' } },
  { name: 'searchFiles', description: 'Search for files by name', params: { dir: 'string', query: 'string' } },
  { name: 'trashFile', description: 'Move file to Trash', params: { path: 'string' } },
  { name: 'launchApp', description: 'Launch a macOS application', params: { name: 'string' } },
  { name: 'killApp', description: 'Kill a process by PID', params: { pid: 'number' } },
  { name: 'getRunningApps', description: 'List running applications', params: {} },
  { name: 'typeText', description: 'Type text with human-like delays', params: { text: 'string' } },
  { name: 'click', description: 'Click at screen coordinates', params: { x: 'number', y: 'number' } },
  { name: 'shortcut', description: 'Execute keyboard shortcut', params: { keys: 'string[]' } },
  { name: 'moveMouse', description: 'Move mouse with bezier curve', params: { x: 'number', y: 'number' } },
  { name: 'snapWindow', description: 'Snap window to position', params: { windowId: 'number', position: 'string' } },
  { name: 'captureScreen', description: 'Take a screenshot', params: {} },
  { name: 'ocrScreen', description: 'OCR text from screenshot', params: { imageBase64: 'string' } },
  { name: 'runAppleScript', description: 'Execute AppleScript for macOS automation', params: { script: 'string' } },
  { name: 'openWithApp', description: 'Open file with specific macOS app', params: { filePath: 'string', appName: 'string' } },
  { name: 'setDockBadge', description: 'Update Dock icon badge count', params: { count: 'number' } },
  { name: 'focusApp', description: 'Bring a macOS app to foreground', params: { appName: 'string' } },
  { name: 'getClipboard', description: 'Read clipboard text', params: {} },
  { name: 'setClipboard', description: 'Write text to clipboard', params: { text: 'string' } },
  { name: 'showMacNotification', description: 'Show macOS notification', params: { title: 'string', body: 'string' } },
  { name: 'webSearch', description: 'Search the web', params: { query: 'string' } },
  { name: 'scrapeUrl', description: 'Scrape webpage content', params: { url: 'string' } },
  { name: 'getCpuUsage', description: 'Get CPU metrics with E-core/P-core breakdown', params: {} },
  { name: 'getRamUsage', description: 'Get memory usage', params: {} },
  { name: 'getBatteryInfo', description: 'Get battery state', params: {} },
  { name: 'getThermalState', description: 'Get thermal throttle status', params: {} },
  { name: 'embed', description: 'Generate embedding vector', params: { text: 'string' } },
  { name: 'vectorSearch', description: 'Semantic search over indexed files', params: { query: 'string' } },
]

interface ToolDefinition {
  name: string
  description: string
  params: Record<string, string>
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  timestamp: number
}

interface StreamCallbacks {
  onToken: (token: string) => void
  onToolCall: (call: ToolCall) => void
  onToolResult: (result: ToolResult) => void
  onComplete: (fullText: string) => void
  onError: (error: string) => void
}

interface VoiceSessionResult {
  transcript: string
  response: string
  error?: string
}

type AIProvider = 'gemini' | 'groq' | 'huggingface'

const MOCK_RESPONSES = [
  'Haan bhai, done. File saved to your Desktop.',
  'Chal, let me check that... Found 3 matching files in ~/Documents.',
  'Safari launched. Opening your tabs from last session.',
  'Battery at 67%, not plugged in. You\'ve got about 4 hours left. M1 running cool — no throttling.',
  'Screenshot captured and OCR\'d. Found the text you were looking for in the top-right panel.',
  'AppleScript executed — Finder window resized and moved to the left half.',
  'Clipboard updated. Cmd+V to paste wherever you need it.',
]

export class IRISOrchestrator {
  private history: ChatMessage[] = []
  private provider: AIProvider = 'gemini'
  private geminiApiKey: string | null = null
  private groqApiKey: string | null = null
  private hfToken: string | null = null
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private isRecording = false
  private voiceWaveformCallback: ((data: Uint8Array) => void) | null = null

  permissionsGranted: MacOSPermissions = {
    camera: false,
    microphone: false,
    accessibility: false,
    screenRecording: false,
  }

  readonly platform = 'darwin' as const

  constructor() {
    this.loadApiKeys()
  }

  private async loadApiKeys(): Promise<void> {
    try {
      const gemini = await window.iris.store.getVault<string>('GEMINI_API_KEY')
      if (gemini.success && gemini.data) this.geminiApiKey = gemini.data

      const groq = await window.iris.store.getVault<string>('GROQ_API_KEY')
      if (groq.success && groq.data) this.groqApiKey = groq.data

      const hf = await window.iris.store.getVault<string>('HF_TOKEN')
      if (hf.success && hf.data) this.hfToken = hf.data
    } catch {
      // vault unavailable — mock mode
    }
  }

  async setApiKey(provider: AIProvider, key: string): Promise<void> {
    const vaultKey = provider === 'gemini' ? 'GEMINI_API_KEY'
      : provider === 'groq' ? 'GROQ_API_KEY'
      : 'HF_TOKEN'
    await window.iris.store.setVault(vaultKey, key)
    if (provider === 'gemini') this.geminiApiKey = key
    else if (provider === 'groq') this.groqApiKey = key
    else this.hfToken = key
  }

  setProvider(provider: AIProvider): void {
    this.provider = provider
  }

  getProvider(): AIProvider {
    return this.provider
  }

  hasApiKey(provider?: AIProvider): boolean {
    const p = provider ?? this.provider
    if (p === 'gemini') return !!this.geminiApiKey
    if (p === 'groq') return !!this.groqApiKey
    if (p === 'huggingface') return !!this.hfToken
    return false
  }

  // ─── Permissions ──────────────────────────────────────────────────────────

  async checkPermissions(): Promise<MacOSPermissions> {
    const [cam, mic, screen] = await Promise.all([
      window.iris.macos.requestPermission('camera'),
      window.iris.macos.requestPermission('microphone'),
      window.iris.macos.requestPermission('screen'),
    ])

    this.permissionsGranted = {
      camera: cam.data?.granted ?? false,
      microphone: mic.data?.granted ?? false,
      accessibility: false,
      screenRecording: screen.data?.granted ?? false,
    }

    // accessibility can't be checked via mediaAccess — probe via input handler
    try {
      const result = await window.iris.screen.getActiveApp()
      if (result.success) this.permissionsGranted.accessibility = true
    } catch { /* no accessibility */ }

    return this.permissionsGranted
  }

  // ─── macOS Shortcuts ──────────────────────────────────────────────────────

  async runAppleScript(script: string): Promise<string> {
    const result = await window.iris.macos.runAppleScript(script)
    if (!result.success) throw new Error(result.error ?? 'AppleScript failed')
    return result.data ?? ''
  }

  async getM1CoreInfo(): Promise<{ model: string; cores: number; eCores?: number; pCores?: number }> {
    const result = await window.iris.system.getCpuUsage()
    if (!result.success || !result.data) throw new Error('Failed to get CPU info')
    return {
      model: result.data.model,
      cores: result.data.cores,
      eCores: result.data.eCores,
      pCores: result.data.pCores,
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  async send(message: string, callbacks: StreamCallbacks): Promise<void> {
    this.history.push({
      role: 'user',
      content: message,
      timestamp: Date.now(),
    })

    if (this.provider === 'gemini' && this.geminiApiKey) {
      await this.streamGemini(message, callbacks)
    } else if (this.provider === 'groq' && this.groqApiKey) {
      await this.streamGroq(message, callbacks)
    } else {
      await this.streamMock(message, callbacks)
    }
  }

  private async streamGemini(message: string, callbacks: StreamCallbacks): Promise<void> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(this.geminiApiKey!)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' })

      const chat = model.startChat({
        history: this.history.slice(0, -1).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        systemInstruction: IRIS_SYSTEM_PROMPT,
      })

      const result = await chat.sendMessageStream(message)
      let fullText = ''

      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          fullText += text
          callbacks.onToken(text)
        }
      }

      const toolCalls = this.extractToolCalls(fullText)
      if (toolCalls.length) {
        for (const call of toolCalls) {
          callbacks.onToolCall(call)
          const toolResult = await this.executeToolCall(call)
          callbacks.onToolResult(toolResult)
        }
      }

      this.history.push({
        role: 'assistant',
        content: fullText,
        toolCalls,
        timestamp: Date.now(),
      })

      callbacks.onComplete(fullText)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      callbacks.onError(msg)
      await this.streamMock(message, callbacks)
    }
  }

  private async streamGroq(message: string, callbacks: StreamCallbacks): Promise<void> {
    try {
      const Groq = (await import('groq-sdk')).default
      const groq = new Groq({ apiKey: this.groqApiKey!, dangerouslyAllowBrowser: true })

      const messages = [
        { role: 'system' as const, content: IRIS_SYSTEM_PROMPT },
        ...this.history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ]

      const stream = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        stream: true,
        max_tokens: 2048,
      })

      let fullText = ''

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) {
          fullText += text
          callbacks.onToken(text)
        }
      }

      const toolCalls = this.extractToolCalls(fullText)
      if (toolCalls.length) {
        for (const call of toolCalls) {
          callbacks.onToolCall(call)
          const toolResult = await this.executeToolCall(call)
          callbacks.onToolResult(toolResult)
        }
      }

      this.history.push({
        role: 'assistant',
        content: fullText,
        toolCalls,
        timestamp: Date.now(),
      })

      callbacks.onComplete(fullText)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      callbacks.onError(msg)
      await this.streamMock(message, callbacks)
    }
  }

  private async streamMock(_message: string, callbacks: StreamCallbacks): Promise<void> {
    const response = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)]!
    const words = response.split(' ')
    let fullText = ''

    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i]
      fullText += token
      callbacks.onToken(token)
      await new Promise((r) => setTimeout(r, 50))
    }

    this.history.push({
      role: 'assistant',
      content: fullText,
      timestamp: Date.now(),
    })

    callbacks.onComplete(fullText)
  }

  // ─── Tool Execution ───────────────────────────────────────────────────────

  private extractToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = []
    const regex = /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})\s*\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      try {
        calls.push({
          name: match[1]!,
          args: JSON.parse(match[2]!),
        })
      } catch { /* malformed JSON — skip */ }
    }
    return calls
  }

  private async executeToolCall(call: ToolCall): Promise<ToolResult> {
    const { name, args } = call
    try {
      const result = await this.dispatchTool(name, args)
      return { name, result }
    } catch (err) {
      return { name, result: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const a = args as Record<string, any>
    switch (name) {
      case 'readFile':
        return (await window.iris.files.read(a.path)).data
      case 'writeFile':
        return (await window.iris.files.write(a.path, a.content)).success
      case 'listFiles':
        return (await window.iris.files.list(a.dir)).data
      case 'searchFiles':
        return (await window.iris.files.search(a.dir, a.query)).data
      case 'trashFile':
        return (await window.iris.files.trash(a.path)).success
      case 'launchApp':
        return (await window.iris.apps.launch(a.name)).data
      case 'killApp':
        return (await window.iris.apps.kill(a.pid)).success
      case 'getRunningApps':
        return (await window.iris.apps.getRunning()).data
      case 'typeText':
        return (await window.iris.input.typeText(a.text, { ghost: true })).success
      case 'click':
        return (await window.iris.input.click(a.x, a.y)).success
      case 'shortcut':
        return (await window.iris.input.shortcut(a.keys)).success
      case 'moveMouse':
        return (await window.iris.input.moveMouse(a.x, a.y)).success
      case 'snapWindow':
        return (await window.iris.window.snap(a.windowId, a.position)).success
      case 'captureScreen':
        return (await window.iris.screen.capture()).data
      case 'ocrScreen':
        return (await window.iris.screen.ocr(a.imageBase64)).data
      case 'runAppleScript':
        return (await window.iris.macos.runAppleScript(a.script)).data
      case 'openWithApp':
        return (await window.iris.macos.openWithApp(a.filePath, a.appName)).success
      case 'setDockBadge':
        return (await window.iris.macos.setDockBadge(a.count)).success
      case 'focusApp':
        return (await window.iris.macos.runAppleScript(
          `tell application "${a.appName}" to activate`
        )).success
      case 'getClipboard':
        return (await window.iris.macos.runAppleScript('the clipboard')).data
      case 'setClipboard':
        return (await window.iris.macos.runAppleScript(
          `set the clipboard to "${(a.text as string).replace(/"/g, '\\"')}"`
        )).success
      case 'showMacNotification':
        return (await window.iris.macos.showNotification(a.title, a.body)).success
      case 'webSearch':
        return (await window.iris.web.search(a.query)).data
      case 'scrapeUrl':
        return (await window.iris.web.scrape(a.url)).data
      case 'getCpuUsage':
        return (await window.iris.system.getCpuUsage()).data
      case 'getRamUsage':
        return (await window.iris.system.getRamUsage()).data
      case 'getBatteryInfo':
        return (await window.iris.system.getBatteryInfo()).data
      case 'getThermalState':
        return (await window.iris.system.getThermalState()).data
      case 'embed':
        return (await window.iris.ai.embed(a.text)).data
      case 'vectorSearch':
        return (await window.iris.ai.vectorSearch(a.query)).data
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  // ─── Voice ────────────────────────────────────────────────────────────────

  async startVoiceSession(
    onWaveform?: (data: Uint8Array) => void
  ): Promise<{ error?: string }> {
    if (!this.permissionsGranted.microphone) {
      const perms = await this.checkPermissions()
      if (!perms.microphone) return { error: 'microphone_denied' }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })

      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(stream)

      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048
      source.connect(this.analyser)

      if (onWaveform) {
        this.voiceWaveformCallback = onWaveform
        this.pumpWaveform()
      }

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data)
      }

      this.mediaRecorder.start(100)
      this.isRecording = true
      return {}
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  private pumpWaveform(): void {
    if (!this.analyser || !this.isRecording) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteTimeDomainData(data)
    this.voiceWaveformCallback?.(data)
    requestAnimationFrame(() => this.pumpWaveform())
  }

  async stopVoiceSession(): Promise<VoiceSessionResult> {
    if (!this.mediaRecorder || !this.isRecording) {
      return { transcript: '', response: '', error: 'No active voice session' }
    }

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        this.isRecording = false
        this.voiceWaveformCallback = null

        if (this.audioContext) {
          await this.audioContext.close()
          this.audioContext = null
        }
        this.analyser = null

        const blob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' })

        const transcript = await this.transcribeAudio(blob)
        if (!transcript) {
          resolve({ transcript: '', response: '', error: 'Transcription failed or empty' })
          return
        }

        let response = ''
        await this.send(transcript, {
          onToken: (token) => { response += token },
          onToolCall: () => {},
          onToolResult: () => {},
          onComplete: () => {},
          onError: (err) => { response = `Error: ${err}` },
        })

        resolve({ transcript, response })
      }

      this.mediaRecorder!.stop()
      this.mediaRecorder!.stream.getTracks().forEach((t) => t.stop())
    })
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  private async transcribeAudio(blob: Blob): Promise<string> {
    if (this.groqApiKey) {
      try {
        const Groq = (await import('groq-sdk')).default
        const groq = new Groq({ apiKey: this.groqApiKey, dangerouslyAllowBrowser: true })
        const file = new File([blob], 'voice.webm', { type: 'audio/webm' })
        const result = await groq.audio.transcriptions.create({
          file,
          model: 'whisper-large-v3',
          language: 'en',
        })
        return result.text
      } catch { /* fall through to mock */ }
    }

    // Mock transcription
    return 'What apps are currently running?'
  }

  // ─── Image Generation ─────────────────────────────────────────────────────

  async generateImage(prompt: string): Promise<{ url: string; mocked: boolean }> {
    if (this.hfToken) {
      try {
        const { HfInference } = await import('@huggingface/inference')
        const hf = new HfInference(this.hfToken)
        const blob = await hf.textToImage({
          model: 'stabilityai/stable-diffusion-xl-base-1.0',
          inputs: prompt,
        })
        const url = URL.createObjectURL(blob)
        return { url, mocked: false }
      } catch { /* fall through to mock */ }
    }

    return {
      url: `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<rect width="512" height="512" fill="#0a0a0a"/>` +
        `<text x="256" y="240" text-anchor="middle" fill="#00e68a" font-family="monospace" font-size="14">` +
        `[IRIS Mock Image]</text>` +
        `<text x="256" y="270" text-anchor="middle" fill="#666" font-family="monospace" font-size="11">` +
        `${prompt.slice(0, 60)}</text>` +
        `<text x="256" y="300" text-anchor="middle" fill="#333" font-family="monospace" font-size="10">` +
        `Add HF_TOKEN for real generation</text></svg>`
      )}`,
      mocked: true,
    }
  }

  // ─── Context ──────────────────────────────────────────────────────────────

  async gatherSystemContext(): Promise<string> {
    const [cpu, ram, battery, thermal, activeApp] = await Promise.allSettled([
      window.iris.system.getCpuUsage(),
      window.iris.system.getRamUsage(),
      window.iris.system.getBatteryInfo(),
      window.iris.system.getThermalState(),
      window.iris.screen.getActiveApp(),
    ])

    const parts: string[] = []

    if (cpu.status === 'fulfilled' && cpu.value.data) {
      const d = cpu.value.data
      let coreStr = `${d.cores} cores`
      if (d.pCores && d.eCores) coreStr += ` (${d.pCores}P + ${d.eCores}E)`
      parts.push(`CPU: ${d.model} — ${coreStr} — ${d.percent}% load`)
    }

    if (ram.status === 'fulfilled' && ram.value.data) {
      const d = ram.value.data
      parts.push(`RAM: ${d.usedGB}/${d.totalGB} GB (${d.percent}%)`)
    }

    if (battery.status === 'fulfilled' && battery.value.data) {
      const d = battery.value.data
      const state = d.isCharging ? 'charging' : d.isPluggedIn ? 'plugged' : 'battery'
      parts.push(`Battery: ${d.percent}% [${state}]`)
    }

    if (thermal.status === 'fulfilled' && thermal.value.data) {
      const d = thermal.value.data
      parts.push(`Thermal: ${d.level}${d.cpuThrottle ? ' (THROTTLED)' : ''}`)
    }

    if (activeApp.status === 'fulfilled' && activeApp.value.data) {
      parts.push(`Active: ${activeApp.value.data.name}`)
    }

    return parts.join(' | ')
  }

  async sendWithContext(message: string, callbacks: StreamCallbacks): Promise<void> {
    const context = await this.gatherSystemContext()
    const enriched = `[System: ${context}]\n\n${message}`
    await this.send(enriched, callbacks)
  }

  // ─── History ──────────────────────────────────────────────────────────────

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  getToolSchemas(): ToolDefinition[] {
    return TOOL_SCHEMAS
  }
}

export const orchestrator = new IRISOrchestrator()
