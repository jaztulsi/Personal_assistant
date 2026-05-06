import { execSync } from 'child_process'
import { shell, Notification, app } from 'electron'
import type { IrisResponse } from '../../../shared/types'

// Sanitize AppleScript input to prevent injection
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

export const macosHandlers = {
  async runAppleScript(_: unknown, script: string): Promise<IrisResponse<string>> {
    try {
      const escaped = escapeAppleScript(script)
      const result = execSync(`osascript -e "${escaped}"`).toString().trim()
      return { success: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },

  async openWithApp(
    _: unknown,
    filePath: string,
    appName: string
  ): Promise<IrisResponse<void>> {
    try {
      const escaped = filePath.replace(/"/g, '\\"')
      execSync(`open -a "${appName}" "${escaped}"`)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },

  async showNotification(
    _: unknown,
    title: string,
    body: string
  ): Promise<IrisResponse<void>> {
    try {
      const notif = new Notification({
        title,
        body,
        subtitle: 'IRIS OS',
      })
      notif.show()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },

  async setDockBadge(_: unknown, count: number): Promise<IrisResponse<void>> {
    try {
      if (count > 0) {
        app.dock.setBadge(String(count))
      } else {
        app.dock.setBadge('')
      }
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },

  async requestPermission(
    _: unknown,
    type: 'camera' | 'microphone' | 'screen'
  ): Promise<IrisResponse<boolean>> {
    try {
      const permission = await app.requestSingleInstanceLock()
      const status = app.getAccessibilityPermissionStatus?.() ?? 'unknown'

      if (type === 'screen') {
        const result = await app.dock?.show?.()
        return { success: true, data: true }
      }

      // For camera/microphone, Electron auto-prompts on first use
      return { success: true, data: status === 'granted' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },
}
