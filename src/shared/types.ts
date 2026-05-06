// IRIS — Shared Types // JASRAJ

// ─── Generic Response Wrapper ────────────────────────────────────────────────

export interface IrisResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  mocked?: boolean
}

// ─── IPC Channel Constants ────────────────────────────────────────────────────

export enum IrisChannel {
  // Files
  FILES_READ        = 'iris:files:read',
  FILES_WRITE       = 'iris:files:write',
  FILES_COPY        = 'iris:files:copy',
  FILES_MOVE        = 'iris:files:move',
  FILES_DELETE      = 'iris:files:delete',
  FILES_LIST        = 'iris:files:list',
  FILES_SEARCH      = 'iris:files:search',
  FILES_TRASH       = 'iris:files:trash',

  // Apps
  APPS_LIST         = 'iris:apps:list',
  APPS_LAUNCH       = 'iris:apps:launch',
  APPS_KILL         = 'iris:apps:kill',
  APPS_GET_RUNNING  = 'iris:apps:getRunning',
  APPS_GET_FROM_APPLICATIONS = 'iris:apps:getFromApplicationsFolder',

  // Input
  INPUT_TYPE_TEXT   = 'iris:input:typeText',
  INPUT_MOVE_MOUSE  = 'iris:input:moveMouse',
  INPUT_CLICK       = 'iris:input:click',
  INPUT_SHORTCUT    = 'iris:input:shortcut',
  INPUT_SCROLL      = 'iris:input:scroll',

  // Window
  WINDOW_SNAP       = 'iris:window:snap',
  WINDOW_MINIMIZE   = 'iris:window:minimize',
  WINDOW_MAXIMIZE   = 'iris:window:maximize',
  WINDOW_FOCUS      = 'iris:window:focus',
  WINDOW_LIST       = 'iris:window:list',
  WINDOW_FULLSCREEN = 'iris:window:fullscreen',

  // Screen
  SCREEN_CAPTURE    = 'iris:screen:capture',
  SCREEN_OCR        = 'iris:screen:ocr',
  SCREEN_GET_INFO   = 'iris:screen:getInfo',
  SCREEN_GET_ACTIVE_APP = 'iris:screen:getActiveApp',

  // ADB
  ADB_CONNECT       = 'iris:adb:connect',
  ADB_LIST_DEVICES  = 'iris:adb:listDevices',
  ADB_TAP           = 'iris:adb:tap',
  ADB_SWIPE         = 'iris:adb:swipe',
  ADB_PUSH          = 'iris:adb:push',
  ADB_PULL          = 'iris:adb:pull',
  ADB_SHELL         = 'iris:adb:shell',

  // Gmail
  GMAIL_AUTH           = 'iris:gmail:auth',
  GMAIL_LIST_MESSAGES  = 'iris:gmail:listMessages',
  GMAIL_SEND_MESSAGE   = 'iris:gmail:sendMessage',
  GMAIL_GET_LABELS     = 'iris:gmail:getLabels',

  // Web
  WEB_SCRAPE        = 'iris:web:scrape',
  WEB_SEARCH        = 'iris:web:search',
  WEB_FETCH_PAGE    = 'iris:web:fetchPage',

  // System
  SYSTEM_GET_CPU         = 'iris:system:getCpuUsage',
  SYSTEM_GET_RAM         = 'iris:system:getRamUsage',
  SYSTEM_GET_PROCESSES   = 'iris:system:getProcesses',
  SYSTEM_GET_INSTALLED   = 'iris:system:getInstalledApps',
  SYSTEM_GET_BATTERY     = 'iris:system:getBatteryInfo',
  SYSTEM_GET_THERMAL     = 'iris:system:getThermalState',

  // Store
  STORE_GET       = 'iris:store:get',
  STORE_SET       = 'iris:store:set',
  STORE_DELETE    = 'iris:store:delete',
  STORE_GET_VAULT = 'iris:store:getVault',
  STORE_SET_VAULT = 'iris:store:setVault',

  // AI
  AI_EMBED          = 'iris:ai:embed',
  AI_VECTOR_SEARCH  = 'iris:ai:vectorSearch',
  AI_INDEX_DIR      = 'iris:ai:indexDirectory',

  // macOS
  MACOS_RUN_APPLESCRIPT  = 'iris:macos:runAppleScript',
  MACOS_OPEN_WITH_APP    = 'iris:macos:openWithApp',
  MACOS_SHOW_NOTIFICATION = 'iris:macos:showNotification',
  MACOS_SET_DOCK_BADGE   = 'iris:macos:setDockBadge',
  MACOS_REQUEST_PERMISSION = 'iris:macos:requestPermission',
}

// ─── Gemini Tool Call ─────────────────────────────────────────────────────────

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  result: unknown
  error?: string
}

// ─── macOS Permissions ────────────────────────────────────────────────────────

export interface MacOSPermissions {
  camera: boolean
  microphone: boolean
  accessibility: boolean
  screenRecording: boolean
}

// ─── App State (Zustand) ──────────────────────────────────────────────────────

export interface AppState {
  permissions: MacOSPermissions
  activeView: string
  sidebarOpen: boolean
  theme: 'iris-dark' | 'iris-void'
  aiProvider: 'gemini' | 'groq' | 'huggingface'
  isLoading: boolean
  lastError: string | null
}

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  modified: string
  created: string
}

export interface RunningApp {
  pid: number
  name: string
  bundleId?: string
  windowTitle?: string
  memoryMB: number
}

export interface InstalledApp {
  name: string
  path: string
  bundleId?: string
  version?: string
}

export interface WindowInfo {
  id: number
  title: string
  appName: string
  bounds: { x: number; y: number; width: number; height: number }
  isMinimized: boolean
}

export interface ScreenInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
}

export interface AdbDevice {
  id: string
  type: 'emulator' | 'device' | 'offline'
  model?: string
  androidVersion?: string
}

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  snippet: string
  date: string
  isRead: boolean
  labels: string[]
}

export interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
  messageCount?: number
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  publishedDate?: string
}

export interface SystemMetrics {
  cpuPercent: number
  cpuCores: number
  cpuModel: string
  ramUsedGB: number
  ramTotalGB: number
  ramPercent: number
  platform: string
  arch: string
  uptime: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpuPercent: number
  memoryMB: number
  status: string
}

export interface EmbeddingResult {
  vector: number[]
  model: string
  dimensions: number
}

export interface VectorSearchResult {
  id: string
  text: string
  score: number
  metadata?: Record<string, unknown>
}

export interface BatteryInfo {
  percent: number
  isCharging: boolean
  isPluggedIn: boolean
  cycleCount: number
  health: number
  timeRemaining: number | null
}

export interface ThermalState {
  cpuThrottle: boolean
  level: string
  raw: string
}

// ─── Window Snap Positions ────────────────────────────────────────────────────

export type SnapPosition =
  | 'left-half'
  | 'right-half'
  | 'top-half'
  | 'bottom-half'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'maximize'
