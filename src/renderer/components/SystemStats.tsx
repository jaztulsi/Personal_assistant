// IRIS SystemStats — M1-aware system telemetry panel // JASRAJ
//
// Polls every 2000ms. Shows efficiency vs performance core load,
// unified memory usage, thermal nominal/throttling, battery + charging,
// and the latest Ollama chat round-trip latency.

import { useEffect, useState } from 'react'

import { orchestrator } from '../core/IRISOrchestrator'

const POLL_MS = 2000

interface CpuInfo {
  percent: number
  cores: number
  eCores?: number
  pCores?: number
  eLoad?: number
  pLoad?: number
}

interface RamInfo { usedGB: number; totalGB: number; percent: number }
interface ThermalInfo { throttling: boolean; temperature?: number }
interface BatteryInfo { level: number; isPlugged: boolean }

interface SystemSnapshot {
  cpu: CpuInfo | null
  ram: RamInfo | null
  thermal: ThermalInfo | null
  battery: BatteryInfo | null
}

const EMPTY: SystemSnapshot = { cpu: null, ram: null, thermal: null, battery: null }

export function SystemStats() {
  const [snap, setSnap] = useState<SystemSnapshot>(EMPTY)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  // Poll system metrics
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const sys = window.iris?.system
      if (!sys) return
      const [cpuR, ramR, thermalR, batteryR] = await Promise.all([
        sys.getCpuUsage().catch(() => null),
        sys.getRamUsage().catch(() => null),
        sys.getThermalState?.().catch(() => null) ?? null,
        sys.getBatteryInfo?.().catch(() => null) ?? null,
      ])
      if (cancelled) return
      setSnap({
        cpu:     cpuR?.success ? (cpuR.data as CpuInfo) ?? null : null,
        ram:     ramR?.success ? (ramR.data as RamInfo) ?? null : null,
        thermal: thermalR?.success ? (thermalR.data as ThermalInfo) ?? null : null,
        battery: batteryR?.success ? (batteryR.data as BatteryInfo) ?? null : null,
      })
    }
    void tick()
    const id = setInterval(tick, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Track Ollama chat latency via orchestrator events
  useEffect(() => {
    let started = 0
    const onChunk = () => { if (!started) started = performance.now() }
    const onComplete = () => {
      if (started) {
        setLatencyMs(Math.round(performance.now() - started))
        started = 0
      }
    }
    const offChunk    = orchestrator.on('stream:chunk',    onChunk)
    const offComplete = orchestrator.on('stream:complete', onComplete)
    return () => { offChunk(); offComplete() }
  }, [])

  return (
    <div className="flex flex-col gap-4 font-mono">
      <SectionTitle>SYSTEM</SectionTitle>

      <CoreSplit
        eLoad={snap.cpu?.eLoad}
        pLoad={snap.cpu?.pLoad}
        eCores={snap.cpu?.eCores}
        pCores={snap.cpu?.pCores}
        fallbackTotal={snap.cpu?.percent}
      />

      <Memory ram={snap.ram} />

      <ThermalRow thermal={snap.thermal} />

      <BatteryRow battery={snap.battery} />

      <LatencyRow ms={latencyMs} />
    </div>
  )
}

// ── Small atoms ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-zinc-600 text-[9px] tracking-[0.4em] uppercase">{children}</p>
  )
}

function StatRow({
  label,
  value,
  accent = 'emerald',
}: {
  label: string
  value: string
  accent?: 'emerald' | 'amber' | 'red' | 'zinc'
}) {
  const colorMap = {
    emerald: 'text-emerald-400',
    amber:   'text-amber-400',
    red:     'text-iris-error',
    zinc:    'text-zinc-300',
  } as const
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500 text-[10px] tracking-widest uppercase">{label}</span>
      <span className={`${colorMap[accent]} text-[10px] tracking-widest uppercase`}>{value}</span>
    </div>
  )
}

function Bar({ value, accent = 'emerald' }: { value: number; accent?: 'emerald' | 'cyan' | 'amber' }) {
  const v = Math.max(0, Math.min(100, value))
  const colorMap = {
    emerald: '#10b981',
    cyan:    '#06b6d4',
    amber:   '#f59e0b',
  } as const
  return (
    <div className="w-full h-1 rounded-full bg-zinc-900 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${v}%`,
          background: colorMap[accent],
          boxShadow: `0 0 6px ${colorMap[accent]}80`,
        }}
      />
    </div>
  )
}

// ── Sub-rows ────────────────────────────────────────────────────────────────

interface CoreSplitProps {
  eLoad: number | undefined
  pLoad: number | undefined
  eCores: number | undefined
  pCores: number | undefined
  fallbackTotal: number | undefined
}

function CoreSplit({ eLoad, pLoad, eCores, pCores, fallbackTotal }: CoreSplitProps) {
  // If the platform doesn't expose E/P split, show total CPU %.
  const haveSplit = typeof eLoad === 'number' && typeof pLoad === 'number'

  if (!haveSplit) {
    const v = typeof fallbackTotal === 'number' ? fallbackTotal : 0
    return (
      <div className="flex flex-col gap-1.5">
        <StatRow label="CPU" value={`${v.toFixed(0)}%`} />
        <Bar value={v} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <StatRow
          label={eCores ? `EFFICIENCY · ${eCores}` : 'EFFICIENCY'}
          value={`${(eLoad ?? 0).toFixed(0)}%`}
        />
        <Bar value={eLoad ?? 0} accent="cyan" />
      </div>
      <div className="flex flex-col gap-1.5">
        <StatRow
          label={pCores ? `PERFORMANCE · ${pCores}` : 'PERFORMANCE'}
          value={`${(pLoad ?? 0).toFixed(0)}%`}
        />
        <Bar value={pLoad ?? 0} />
      </div>
    </div>
  )
}

function Memory({ ram }: { ram: { usedGB: number; totalGB: number; percent: number } | null }) {
  const used  = ram?.usedGB.toFixed(1) ?? '—'
  const total = ram?.totalGB.toFixed(0) ?? '—'
  const pct   = ram?.percent ?? 0
  return (
    <div className="flex flex-col gap-1.5">
      <StatRow label="UNIFIED MEMORY" value={`${used} / ${total} GB`} />
      <Bar value={pct} />
    </div>
  )
}

function ThermalRow({ thermal }: { thermal: { throttling: boolean; temperature?: number } | null }) {
  let label = 'NOMINAL'
  let accent: 'emerald' | 'amber' | 'red' | 'zinc' = 'emerald'
  if (thermal === null) {
    label = '—'; accent = 'zinc'
  } else if (thermal.throttling) {
    if ((thermal.temperature ?? 0) >= 95) { label = 'CRITICAL'; accent = 'red' }
    else { label = 'THROTTLING'; accent = 'amber' }
  }
  const right = thermal?.temperature
    ? `${label} · ${thermal.temperature.toFixed(0)}°C`
    : label
  return <StatRow label="THERMAL" value={right} accent={accent} />
}

function BatteryRow({ battery }: { battery: { level: number; isPlugged: boolean } | null }) {
  if (!battery || battery.level <= 0) {
    return <StatRow label="POWER" value="AC" accent="emerald" />
  }
  const charging = battery.isPlugged ? '⚡ ' : ''
  const accent = battery.level < 20 ? 'red' : battery.level < 40 ? 'amber' : 'emerald'
  return (
    <StatRow
      label="BATTERY"
      value={`${charging}${battery.level.toFixed(0)}%`}
      accent={accent}
    />
  )
}

function LatencyRow({ ms }: { ms: number | null }) {
  if (ms === null) {
    return <StatRow label="OLLAMA LATENCY" value="—" accent="zinc" />
  }
  const accent = ms < 500 ? 'emerald' : ms < 2000 ? 'amber' : 'red'
  return <StatRow label="OLLAMA LATENCY" value={`${ms} MS`} accent={accent} />
}

export default SystemStats
