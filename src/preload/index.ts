import { contextBridge, ipcRenderer } from 'electron'
import { IrisChannel } from '../shared/types'
import type {
  IrisResponse,
  FileEntry,
  RunningApp,
  InstalledApp,
  WindowInfo,
  ScreenInfo,
  AdbDevice,
  GmailMessage,
  GmailLabel,
  WebSearchResult,
  SystemMetrics,
  ProcessInfo,
  EmbeddingResult,
  VectorSearchResult,
  SnapPosition,
} from '../shared/types'

// IRIS IPC Bridge // JASRAJ

const invoke = <T>(channel: IrisChannel, ...args: unknown[]): Promise<IrisResponse<T>> =>
  ipcRenderer.invoke(channel, ...args)

const irisAPI = {
  files: {
    read: (path: string) =>
      invoke<string>(IrisChannel.FILES_READ, path),
    write: (path: string, content: string) =>
      invoke<void>(IrisChannel.FILES_WRITE, path, content),
    copy: (src: string, dest: string) =>
      invoke<void>(IrisChannel.FILES_COPY, src, dest),
    move: (src: string, dest: string) =>
      invoke<void>(IrisChannel.FILES_MOVE, src, dest),
    delete: (path: string) =>
      invoke<void>(IrisChannel.FILES_DELETE, path),
    list: (dir: string) =>
      invoke<FileEntry[]>(IrisChannel.FILES_LIST, dir),
    search: (dir: string, query: string, options?: { ext?: string; recursive?: boolean }) =>
      invoke<FileEntry[]>(IrisChannel.FILES_SEARCH, dir, query, options),
  },

  apps: {
    list: () =>
      invoke<InstalledApp[]>(IrisChannel.APPS_LIST),
    launch: (appNameOrPath: string, args?: string[]) =>
      invoke<{ pid: number }>(IrisChannel.APPS_LAUNCH, appNameOrPath, args),
    kill: (pid: number) =>
      invoke<void>(IrisChannel.APPS_KILL, pid),
    getRunning: () =>
      invoke<RunningApp[]>(IrisChannel.APPS_GET_RUNNING),
  },

  input: {
    typeText: (text: string, options?: { ghost?: boolean }) =>
      invoke<void>(IrisChannel.INPUT_TYPE_TEXT, text, options),
    moveMouse: (x: number, y: number, options?: { duration?: number }) =>
      invoke<void>(IrisChannel.INPUT_MOVE_MOUSE, x, y, options),
    click: (x: number, y: number, button?: 'left' | 'right' | 'middle') =>
      invoke<void>(IrisChannel.INPUT_CLICK, x, y, button),
    shortcut: (keys: string[]) =>
      invoke<void>(IrisChannel.INPUT_SHORTCUT, keys),
    scroll: (x: number, y: number, deltaX: number, deltaY: number) =>
      invoke<void>(IrisChannel.INPUT_SCROLL, x, y, deltaX, deltaY),
  },

  window: {
    snap: (windowId: number, position: SnapPosition) =>
      invoke<void>(IrisChannel.WINDOW_SNAP, windowId, position),
    minimize: (windowId: number) =>
      invoke<void>(IrisChannel.WINDOW_MINIMIZE, windowId),
    maximize: (windowId: number) =>
      invoke<void>(IrisChannel.WINDOW_MAXIMIZE, windowId),
    focus: (windowId: number) =>
      invoke<void>(IrisChannel.WINDOW_FOCUS, windowId),
    list: () =>
      invoke<WindowInfo[]>(IrisChannel.WINDOW_LIST),
  },

  screen: {
    capture: (displayId?: number) =>
      invoke<string>(IrisChannel.SCREEN_CAPTURE, displayId),
    ocr: (imageBase64: string) =>
      invoke<string>(IrisChannel.SCREEN_OCR, imageBase64),
    getInfo: () =>
      invoke<ScreenInfo[]>(IrisChannel.SCREEN_GET_INFO),
  },

  adb: {
    connect: (host: string, port?: number) =>
      invoke<{ id: string }>(IrisChannel.ADB_CONNECT, host, port),
    listDevices: () =>
      invoke<AdbDevice[]>(IrisChannel.ADB_LIST_DEVICES),
    tap: (deviceId: string, x: number, y: number) =>
      invoke<void>(IrisChannel.ADB_TAP, deviceId, x, y),
    swipe: (deviceId: string, x1: number, y1: number, x2: number, y2: number, duration?: number) =>
      invoke<void>(IrisChannel.ADB_SWIPE, deviceId, x1, y1, x2, y2, duration),
    push: (deviceId: string, localPath: string, remotePath: string) =>
      invoke<void>(IrisChannel.ADB_PUSH, deviceId, localPath, remotePath),
    pull: (deviceId: string, remotePath: string, localPath: string) =>
      invoke<void>(IrisChannel.ADB_PULL, deviceId, remotePath, localPath),
    shell: (deviceId: string, command: string) =>
      invoke<string>(IrisChannel.ADB_SHELL, deviceId, command),
  },

  gmail: {
    auth: () =>
      invoke<{ authenticated: boolean; email?: string }>(IrisChannel.GMAIL_AUTH),
    listMessages: (options?: { maxResults?: number; query?: string; labelId?: string }) =>
      invoke<GmailMessage[]>(IrisChannel.GMAIL_LIST_MESSAGES, options),
    sendMessage: (to: string, subject: string, body: string) =>
      invoke<{ messageId: string }>(IrisChannel.GMAIL_SEND_MESSAGE, to, subject, body),
    getLabels: () =>
      invoke<GmailLabel[]>(IrisChannel.GMAIL_GET_LABELS),
  },

  web: {
    scrape: (url: string, selector?: string) =>
      invoke<string>(IrisChannel.WEB_SCRAPE, url, selector),
    search: (query: string, options?: { maxResults?: number }) =>
      invoke<WebSearchResult[]>(IrisChannel.WEB_SEARCH, query, options),
    fetchPage: (url: string, options?: { js?: boolean }) =>
      invoke<string>(IrisChannel.WEB_FETCH_PAGE, url, options),
  },

  system: {
    getCpuUsage: () =>
      invoke<{ percent: number; model: string; cores: number }>(IrisChannel.SYSTEM_GET_CPU),
    getRamUsage: () =>
      invoke<{ usedGB: number; totalGB: number; percent: number }>(IrisChannel.SYSTEM_GET_RAM),
    getProcesses: () =>
      invoke<ProcessInfo[]>(IrisChannel.SYSTEM_GET_PROCESSES),
    getInstalledApps: () =>
      invoke<InstalledApp[]>(IrisChannel.SYSTEM_GET_INSTALLED),
  },

  store: {
    get: <T = unknown>(key: string) =>
      invoke<T>(IrisChannel.STORE_GET, key),
    set: (key: string, value: unknown) =>
      invoke<void>(IrisChannel.STORE_SET, key, value),
    delete: (key: string) =>
      invoke<void>(IrisChannel.STORE_DELETE, key),
    getVault: <T = unknown>(key: string) =>
      invoke<T>(IrisChannel.STORE_GET_VAULT, key),
    setVault: (key: string, value: string) =>
      invoke<void>(IrisChannel.STORE_SET_VAULT, key, value),
  },

  ai: {
    embed: (text: string) =>
      invoke<EmbeddingResult>(IrisChannel.AI_EMBED, text),
    vectorSearch: (query: string, options?: { topK?: number; threshold?: number }) =>
      invoke<VectorSearchResult[]>(IrisChannel.AI_VECTOR_SEARCH, query, options),
    indexDirectory: (dir: string, options?: { recursive?: boolean; extensions?: string[] }) =>
      invoke<{ indexed: number }>(IrisChannel.AI_INDEX_DIR, dir, options),
  },
} as const

contextBridge.exposeInMainWorld('iris', irisAPI)

export type IrisAPI = typeof irisAPI

declare global {
  interface Window {
    iris: IrisAPI
  }
}
