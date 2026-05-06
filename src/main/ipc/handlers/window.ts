import { screen } from 'electron'
import type { IrisResponse, WindowInfo, SnapPosition } from '../../../shared/types'

async function getManager() {
  const { windowManager } = await import('node-window-manager')
  return windowManager
}

function snapBounds(pos: SnapPosition, screenW: number, screenH: number) {
  const half = { width: screenW / 2, height: screenH }
  const quarter = { width: screenW / 2, height: screenH / 2 }
  const map: Record<SnapPosition, { x: number; y: number; width: number; height: number }> = {
    'left-half':    { x: 0,         y: 0,          ...half },
    'right-half':   { x: screenW/2, y: 0,          ...half },
    'top-half':     { x: 0,         y: 0,          width: screenW, height: screenH/2 },
    'bottom-half':  { x: 0,         y: screenH/2,  width: screenW, height: screenH/2 },
    'top-left':     { x: 0,         y: 0,          ...quarter },
    'top-right':    { x: screenW/2, y: 0,          ...quarter },
    'bottom-left':  { x: 0,         y: screenH/2,  ...quarter },
    'bottom-right': { x: screenW/2, y: screenH/2,  ...quarter },
    'center':       { x: screenW/4, y: screenH/4,  width: screenW/2, height: screenH/2 },
    'maximize':     { x: 0,         y: 0,          width: screenW, height: screenH },
  }
  return map[pos]
}

function findWindow(wm: Awaited<ReturnType<typeof getManager>>, windowId: number) {
  return wm.getWindows().find((w) => w.id === windowId)
}

export const windowHandlers = {
  async list(): Promise<IrisResponse<WindowInfo[]>> {
    const wm = await getManager()
    const windows = wm.getWindows()
    const infos: WindowInfo[] = windows.map((w) => ({
      id: w.id,
      title: w.getTitle(),
      appName: w.path ?? '',
      bounds: w.getBounds(),
      isMinimized: w.isMinimized?.() ?? false,
    }))
    return { success: true, data: infos }
  },

  async snap(_: unknown, windowId: number, position: SnapPosition): Promise<IrisResponse<void>> {
    const wm = await getManager()
    const win = findWindow(wm, windowId)
    if (!win) return { success: false, error: `Window ${windowId} not found` }

    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.workAreaSize
    const bounds = snapBounds(position, width, height)
    win.setBounds(bounds)
    return { success: true }
  },

  async minimize(_: unknown, windowId: number): Promise<IrisResponse<void>> {
    const wm = await getManager()
    const win = findWindow(wm, windowId)
    if (!win) return { success: false, error: `Window ${windowId} not found` }
    win.minimize()
    return { success: true }
  },

  async maximize(_: unknown, windowId: number): Promise<IrisResponse<void>> {
    const wm = await getManager()
    const win = findWindow(wm, windowId)
    if (!win) return { success: false, error: `Window ${windowId} not found` }
    win.maximize?.()
    return { success: true }
  },

  async focus(_: unknown, windowId: number): Promise<IrisResponse<void>> {
    const wm = await getManager()
    const win = findWindow(wm, windowId)
    if (!win) return { success: false, error: `Window ${windowId} not found` }
    win.bringToTop()
    return { success: true }
  },

  async fullscreen(_: unknown, windowId: number): Promise<IrisResponse<void>> {
    const wm = await getManager()
    const win = findWindow(wm, windowId)
    if (!win) return { success: false, error: `Window ${windowId} not found` }

    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    win.setBounds({ x: 0, y: 0, width, height })
    return { success: true }
  },
}
