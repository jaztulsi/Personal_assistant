import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { IrisResponse, ProcessInfo, InstalledApp, BatteryInfo, ThermalState } from '../../../shared/types'

const execAsync = promisify(exec)

export const systemHandlers = {
  async getCpuUsage(): Promise<IrisResponse<{ percent: number; model: string; cores: number; eCores?: number; pCores?: number }>> {
    const si = await import('systeminformation')
    const [load, cpu] = await Promise.all([si.currentLoad(), si.cpu()])

    let eCores: number | undefined
    let pCores: number | undefined
    try {
      const { stdout } = await execAsync('sysctl -n hw.perflevel0.logicalcpu hw.perflevel1.logicalcpu 2>/dev/null || true')
      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length >= 2) {
        pCores = parseInt(lines[0]!, 10)
        eCores = parseInt(lines[1]!, 10)
      }
    } catch { /* non-Apple-Silicon or unavailable */ }

    return {
      success: true,
      data: {
        percent: Math.round(load.currentLoad * 10) / 10,
        model: `${cpu.manufacturer} ${cpu.brand}`,
        cores: cpu.physicalCores,
        eCores,
        pCores,
      },
    }
  },

  async getRamUsage(): Promise<IrisResponse<{ usedGB: number; totalGB: number; percent: number }>> {
    const si = await import('systeminformation')
    const mem = await si.mem()
    const usedGB = Math.round((mem.used / 1e9) * 100) / 100
    const totalGB = Math.round((mem.total / 1e9) * 100) / 100
    return {
      success: true,
      data: {
        usedGB,
        totalGB,
        percent: Math.round((mem.used / mem.total) * 1000) / 10,
      },
    }
  },

  async getProcesses(): Promise<IrisResponse<ProcessInfo[]>> {
    const si = await import('systeminformation')
    const { list } = await si.processes()
    const procs: ProcessInfo[] = list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpuPercent: Math.round(p.cpu * 10) / 10,
        memoryMB: Math.round(p.mem_rss / 1024),
        status: p.state,
      }))
    return { success: true, data: procs }
  },

  async getInstalledApps(): Promise<IrisResponse<InstalledApp[]>> {
    const { stdout } = await execAsync(
      `find /Applications ~/Applications -maxdepth 2 -name "*.app" -not -path "*/Contents/*" 2>/dev/null || true`
    )
    const apps: InstalledApp[] = stdout
      .split('\n')
      .filter(Boolean)
      .map((p) => ({ name: path.basename(p, '.app'), path: p }))

    return { success: true, data: apps }
  },

  async getBatteryInfo(): Promise<IrisResponse<BatteryInfo>> {
    const si = await import('systeminformation')
    const bat = await si.battery()
    return {
      success: true,
      data: {
        percent: bat.percent,
        isCharging: bat.isCharging,
        isPluggedIn: bat.acConnected,
        cycleCount: bat.cycleCount,
        health: bat.capacityUnit === 'mWh'
          ? Math.round((bat.currentCapacity / bat.maxCapacity) * 100)
          : 100,
        timeRemaining: bat.timeRemaining > 0 ? bat.timeRemaining : null,
      },
    }
  },

  async getThermalState(): Promise<IrisResponse<ThermalState>> {
    const { stdout } = await execAsync('pmset -g therm 2>/dev/null || echo "unavailable"')
    const raw = stdout.trim()
    const cpuThrottle = raw.includes('CPU_Speed_Limit') && !raw.includes('CPU_Speed_Limit\t\t100')
    let level = 'nominal'
    if (raw.includes('CPU_Speed_Limit')) {
      const match = raw.match(/CPU_Speed_Limit\s+(\d+)/)
      if (match) {
        const limit = parseInt(match[1]!, 10)
        if (limit < 50) level = 'critical'
        else if (limit < 80) level = 'serious'
        else if (limit < 100) level = 'fair'
      }
    }
    return { success: true, data: { cpuThrottle, level, raw } }
  },
}
