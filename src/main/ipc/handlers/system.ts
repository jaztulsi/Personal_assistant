import { execSync } from 'child_process'
import type { IrisResponse, ProcessInfo, InstalledApp } from '../../../shared/types'

export const systemHandlers = {
  async getCpuUsage(): Promise<IrisResponse<{ percent: number; model: string; cores: number; ecores?: number; pcores?: number }>> {
    const si = await import('systeminformation')
    const [load, cpu] = await Promise.all([si.currentLoad(), si.cpu()])

    // M1/M2/M3 detection: E-cores + P-cores
    const isMSeries = cpu.brand?.includes('Apple')
    let ecores: number | undefined
    let pcores: number | undefined

    if (isMSeries) {
      try {
        const sysctl = execSync('sysctl -a 2>/dev/null | grep hw.perflevel').toString()
        ecores = parseInt(sysctl.match(/\d+/)?.[0] ?? '0')
        pcores = cpu.physicalCores - (ecores || 0)
      } catch {
        // fallback: assume split
      }
    }

    return {
      success: true,
      data: {
        percent: Math.round(load.currentLoad * 10) / 10,
        model: `${cpu.manufacturer} ${cpu.brand}`,
        cores: cpu.physicalCores,
        ...(isMSeries && ecores !== undefined && { ecores, pcores }),
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
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const path = await import('path')

    const { stdout } = await execAsync(
      `find /Applications -maxdepth 2 -name "*.app" -not -path "*/Contents/*" 2>/dev/null || true`
    )
    const apps: InstalledApp[] = stdout
      .split('\n')
      .filter(Boolean)
      .map((p) => ({ name: path.basename(p, '.app'), path: p }))

    return { success: true, data: apps }
  },

  async getBatteryInfo(): Promise<IrisResponse<{ level: number; isPlugged: boolean; health?: string }>> {
    try {
      const si = await import('systeminformation')
      const battery = await si.battery()
      return {
        success: true,
        data: {
          level: Math.round(battery.percent),
          isPlugged: battery.acConnected,
          health: battery.health,
        },
      }
    } catch {
      return { success: false, error: 'Battery info unavailable' }
    }
  },

  async getThermalState(): Promise<IrisResponse<{ throttling: boolean; temperature?: number }>> {
    try {
      const output = execSync('pmset -g therm 2>/dev/null || true').toString()
      const throttling = output.includes('Thermal Warning') || output.includes('Thermal Critical')
      return { success: true, data: { throttling } }
    } catch {
      return { success: false, error: 'Thermal state unavailable' }
    }
  },
}
