import { app, BrowserWindow, dialog, systemPreferences, shell } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerAllHandlers } from './ipc/index'

// IRIS // JASRAJ

// Node ESM has no __dirname. Derive it from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

async function requestMacOSPermissions(): Promise<void> {
  // Camera
  const camStatus = systemPreferences.getMediaAccessStatus('camera')
  if (camStatus === 'not-determined') {
    await systemPreferences.askForMediaAccess('camera')
  }

  // Microphone
  const micStatus = systemPreferences.getMediaAccessStatus('microphone')
  if (micStatus === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone')
  }

  // Accessibility — must open System Settings manually
  const { default: nut } = await import('@nut-tree/nut-js').catch(() => ({ default: null }))
  if (nut) {
    const hasAccess = await (nut as any).getActiveWindow().then(() => true).catch(() => false)
    if (!hasAccess) {
      dialog.showMessageBox({
        type: 'info',
        title: 'IRIS needs Accessibility access',
        message: 'Grant Accessibility permission so IRIS can control your keyboard and mouse.',
        detail: 'Open System Settings → Privacy & Security → Accessibility and enable IRIS.',
        buttons: ['Open System Settings', 'Skip'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          shell.open('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
        }
      })
    }
  }

  // Screen Recording
  const srStatus = systemPreferences.getMediaAccessStatus('screen')
  if (srStatus !== 'granted') {
    dialog.showMessageBox({
      type: 'info',
      title: 'IRIS needs Screen Recording access',
      message: 'Grant Screen Recording permission so IRIS can capture your screen.',
      detail: 'Open System Settings → Privacy & Security → Screen Recording and enable IRIS.',
      buttons: ['Open System Settings', 'Skip'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        shell.open('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      }
    })
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    vibrancy: 'fullscreen-ui',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    transparent: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  registerAllHandlers()
  createWindow()
  await requestMacOSPermissions()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
