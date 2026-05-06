import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { existsSync } from 'fs'
import type { IrisResponse, InstalledApp, RunningApp } from '../../../shared/types'

const execAsync = promisify(exec)

async function scanAppsDir(dir: string): Promise<InstalledApp[]> {
  if (!existsSync(dir)) return []
  const { stdout } = await execAsync(
    `find "${dir}" -maxdepth 2 -name "*.app" -not -path "*/Contents/*" 2>/dev/null || true`
  )
  const apps: InstalledApp[] = []
  for (const line of stdout.split('\n').filter(Boolean)) {
    const name = path.basename(line, '.app')
    const plistPath = path.join(line, 'Contents/Info.plist')
    let bundleId: string | undefined
    let version: string | undefined
    try {
      const { stdout: bid } = await execAsync(
        `defaults read "${plistPath}" CFBundleIdentifier 2>/dev/null || true`
      )
      bundleId = bid.trim() || undefined
      const { stdout: ver } = await execAsync(
        `defaults read "${plistPath}" CFBundleShortVersionString 2>/dev/null || true`
      )
      version = ver.trim() || undefined
    } catch {
      // plist unreadable
    }
    apps.push({ name, path: line, bundleId, version })
  }
  return apps
}

export const appsHandlers = {
  async list(): Promise<IrisResponse<InstalledApp[]>> {
    const [system, user] = await Promise.allSettled([
      scanAppsDir('/Applications'),
      scanAppsDir(`${process.env['HOME']}/Applications`),
    ])
    const apps: InstalledApp[] = [
      ...(system.status === 'fulfilled' ? system.value : []),
      ...(user.status === 'fulfilled' ? user.value : []),
    ]
    return { success: true, data: apps }
  },

  async launch(_: unknown, appNameOrPath: string, args: string[] = []): Promise<IrisResponse<{ pid: number }>> {
    let cmd = `open -a "${appNameOrPath}"`
    if (args.length) cmd += ` --args ${args.map((a) => `"${a}"`).join(' ')}`

    const { stdout } = await execAsync(cmd)
    const pidMatch = stdout.match(/\d+/)
    const pid = pidMatch ? parseInt(pidMatch[0]!, 10) : 0
    return { success: true, data: { pid } }
  },

  async kill(_: unknown, pid: number): Promise<IrisResponse<void>> {
    process.kill(pid, 'SIGTERM')
    return { success: true }
  },

  async getRunning(): Promise<IrisResponse<RunningApp[]>> {
    const { stdout } = await execAsync(
      `ps -eo pid,comm,rss --no-headers 2>/dev/null || ps -eo pid,comm,rss`
    )
    const apps: RunningApp[] = []
    for (const line of stdout.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 3) continue
      const pid = parseInt(parts[0]!, 10)
      const name = path.basename(parts[1] ?? 'unknown')
      const memoryMB = Math.round((parseInt(parts[2]!, 10) / 1024) * 10) / 10
      apps.push({ pid, name, memoryMB })
    }
    return { success: true, data: apps }
  },

  async getFromApplicationsFolder(
    _: unknown,
    appName: string
  ): Promise<IrisResponse<InstalledApp | null>> {
    const candidates = [
      `/Applications/${appName}.app`,
      `${process.env['HOME']}/Applications/${appName}.app`,
    ]
    for (const appPath of candidates) {
      if (existsSync(appPath)) {
        const plistPath = path.join(appPath, 'Contents/Info.plist')
        let bundleId: string | undefined
        let version: string | undefined
        try {
          const { stdout: bid } = await execAsync(
            `defaults read "${plistPath}" CFBundleIdentifier 2>/dev/null || true`
          )
          bundleId = bid.trim() || undefined
          const { stdout: ver } = await execAsync(
            `defaults read "${plistPath}" CFBundleShortVersionString 2>/dev/null || true`
          )
          version = ver.trim() || undefined
        } catch { /* skip */ }
        return { success: true, data: { name: appName, path: appPath, bundleId, version } }
      }
    }
    return { success: true, data: null }
  },
}
