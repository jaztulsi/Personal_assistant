import type { IrisResponse, ProcessInfo, InstalledApp } from '../../../shared/types'

export const systemHandlers = {
  async getCpuUsage(): Promise<IrisResponse<{ percent: number; model: string; cores: number }>> {
    const si = await import('systeminformation')
    const [load, cpu] = await Promise.all([si.currentLoad(), si.cpu()])
    return {
      success: true,
      data: {
        percent: Math.round(load.currentLoad * 10) / 10,
        model: `${cpu.manufacturer} ${cpu.brand}`,
        cores: cpu.physicalCores,
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
    // Delegate to apps handler logic — scan /Applications
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
}
