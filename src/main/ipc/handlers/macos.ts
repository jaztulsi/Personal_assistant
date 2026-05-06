import { exec } from 'child_process'
import { promisify } from 'util'
import { app, Notification, systemPreferences } from 'electron'
import type { IrisResponse } from '../../../shared/types'

const execAsync = promisify(exec)

function sanitizeAppleScript(script: string): string {
  return script.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

export const macosHandlers = {
  async runAppleScript(_: unknown, script: string): Promise<IrisResponse<string>> {
    const sanitized = sanitizeAppleScript(script)
    const escaped = sanitized.replace(/'/g, "'\\''")
    const { stdout } = await execAsync(`osascript -e '${escaped}'`, { timeout: 30000 })
    return { success: true, data: stdout.trim() }
  },

  async openWithApp(_: unknown, filePath: string, appName: string): Promise<IrisResponse<void>> {
    await execAsync(`open -a "${appName}" "${filePath}"`)
    return { success: true }
  },

  async showNotification(_: unknown, title: string, body: string): Promise<IrisResponse<void>> {
    new Notification({ title, body }).show()
    return { success: true }
  },

  async setDockBadge(_: unknown, count: number | string): Promise<IrisResponse<void>> {
    app.dock.setBadge(String(count))
    return { success: true }
  },

  async requestPermission(
    _: unknown,
    type: 'camera' | 'microphone' | 'screen'
  ): Promise<IrisResponse<{ granted: boolean }>> {
    if (type === 'screen') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      return { success: true, data: { granted: status === 'granted' } }
    }
    const granted = await systemPreferences.askForMediaAccess(type)
    return { success: true, data: { granted } }
  },
}
