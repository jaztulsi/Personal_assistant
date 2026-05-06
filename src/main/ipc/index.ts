import { ipcMain } from 'electron'
import { IrisChannel } from '../../shared/types'
import { filesHandlers } from './handlers/files'
import { appsHandlers } from './handlers/apps'
import { inputHandlers } from './handlers/input'
import { windowHandlers } from './handlers/window'
import { screenHandlers } from './handlers/screen'
import { adbHandlers } from './handlers/adb'
import { gmailHandlers } from './handlers/gmail'
import { webHandlers } from './handlers/web'
import { systemHandlers } from './handlers/system'
import { storeHandlers } from './handlers/store'
import { aiHandlers } from './handlers/ai'
import type { IrisResponse } from '../../shared/types'

// IRIS IPC Router // JASRAJ

type HandlerFn = (...args: unknown[]) => Promise<IrisResponse>

const wrap = (fn: HandlerFn): HandlerFn =>
  async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

const allHandlers: Record<IrisChannel, HandlerFn> = {
  // Files
  [IrisChannel.FILES_READ]:   filesHandlers.read,
  [IrisChannel.FILES_WRITE]:  filesHandlers.write,
  [IrisChannel.FILES_COPY]:   filesHandlers.copy,
  [IrisChannel.FILES_MOVE]:   filesHandlers.move,
  [IrisChannel.FILES_DELETE]: filesHandlers.delete,
  [IrisChannel.FILES_LIST]:   filesHandlers.list,
  [IrisChannel.FILES_SEARCH]: filesHandlers.search,

  // Apps
  [IrisChannel.APPS_LIST]:        appsHandlers.list,
  [IrisChannel.APPS_LAUNCH]:      appsHandlers.launch,
  [IrisChannel.APPS_KILL]:        appsHandlers.kill,
  [IrisChannel.APPS_GET_RUNNING]: appsHandlers.getRunning,

  // Input
  [IrisChannel.INPUT_TYPE_TEXT]:  inputHandlers.typeText,
  [IrisChannel.INPUT_MOVE_MOUSE]: inputHandlers.moveMouse,
  [IrisChannel.INPUT_CLICK]:      inputHandlers.click,
  [IrisChannel.INPUT_SHORTCUT]:   inputHandlers.shortcut,
  [IrisChannel.INPUT_SCROLL]:     inputHandlers.scroll,

  // Window
  [IrisChannel.WINDOW_SNAP]:     windowHandlers.snap,
  [IrisChannel.WINDOW_MINIMIZE]: windowHandlers.minimize,
  [IrisChannel.WINDOW_MAXIMIZE]: windowHandlers.maximize,
  [IrisChannel.WINDOW_FOCUS]:    windowHandlers.focus,
  [IrisChannel.WINDOW_LIST]:     windowHandlers.list,

  // Screen
  [IrisChannel.SCREEN_CAPTURE]:  screenHandlers.capture,
  [IrisChannel.SCREEN_OCR]:      screenHandlers.ocr,
  [IrisChannel.SCREEN_GET_INFO]: screenHandlers.getInfo,

  // ADB
  [IrisChannel.ADB_CONNECT]:      adbHandlers.connect,
  [IrisChannel.ADB_LIST_DEVICES]: adbHandlers.listDevices,
  [IrisChannel.ADB_TAP]:          adbHandlers.tap,
  [IrisChannel.ADB_SWIPE]:        adbHandlers.swipe,
  [IrisChannel.ADB_PUSH]:         adbHandlers.push,
  [IrisChannel.ADB_PULL]:         adbHandlers.pull,
  [IrisChannel.ADB_SHELL]:        adbHandlers.shell,

  // Gmail
  [IrisChannel.GMAIL_AUTH]:          gmailHandlers.auth,
  [IrisChannel.GMAIL_LIST_MESSAGES]: gmailHandlers.listMessages,
  [IrisChannel.GMAIL_SEND_MESSAGE]:  gmailHandlers.sendMessage,
  [IrisChannel.GMAIL_GET_LABELS]:    gmailHandlers.getLabels,

  // Web
  [IrisChannel.WEB_SCRAPE]:     webHandlers.scrape,
  [IrisChannel.WEB_SEARCH]:     webHandlers.search,
  [IrisChannel.WEB_FETCH_PAGE]: webHandlers.fetchPage,

  // System
  [IrisChannel.SYSTEM_GET_CPU]:       systemHandlers.getCpuUsage,
  [IrisChannel.SYSTEM_GET_RAM]:       systemHandlers.getRamUsage,
  [IrisChannel.SYSTEM_GET_PROCESSES]: systemHandlers.getProcesses,
  [IrisChannel.SYSTEM_GET_INSTALLED]: systemHandlers.getInstalledApps,

  // Store
  [IrisChannel.STORE_GET]:       storeHandlers.get,
  [IrisChannel.STORE_SET]:       storeHandlers.set,
  [IrisChannel.STORE_DELETE]:    storeHandlers.delete,
  [IrisChannel.STORE_GET_VAULT]: storeHandlers.getVault,
  [IrisChannel.STORE_SET_VAULT]: storeHandlers.setVault,

  // AI
  [IrisChannel.AI_EMBED]:         aiHandlers.embed,
  [IrisChannel.AI_VECTOR_SEARCH]: aiHandlers.vectorSearch,
  [IrisChannel.AI_INDEX_DIR]:     aiHandlers.indexDirectory,
}

export function registerAllHandlers(): void {
  for (const [channel, handler] of Object.entries(allHandlers)) {
    ipcMain.handle(channel, (_event, ...args) => wrap(handler as HandlerFn)(...args))
  }
}
