// IRIS Dashboard — primary workspace // JASRAJ
//
// 3-column fullscreen layout, paddingTop 28 for traffic lights:
//   [320px] ChatSidebar  |  [flex-1] ParticleSphere + MicButton  |  [280px] SystemStats + OllamaStatus

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ChatSidebar } from '../components/ChatSidebar'
import { ParticleSphere } from '../components/ParticleSphere'
import { SystemStats } from '../components/SystemStats'
import { OllamaStatus } from '../components/OllamaStatus'
import { MicButton } from '../components/MicButton'

import { orchestrator } from '../core/IRISOrchestrator'

interface Props {
  onLock?: () => void
}

const PANEL =
  'bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl'

const ACTIVE_GLOW = '0 0 24px rgba(52,211,153,0.2)'

export function Dashboard({ onLock }: Props) {
  const navigate = useNavigate()
  const [online, setOnline] = useState<boolean>(orchestrator.ollamaOnline)
  const [listening, setListening] = useState<boolean>(orchestrator.isListening)
  const [now, setNow] = useState(() => new Date())
  const [freqData, setFreqData] = useState<Uint8Array | null>(null)
  const rafRef = useRef<number | null>(null)

  // ── Initialize the orchestrator (once) ────────────────────────────────────
  useEffect(() => {
    void orchestrator.init()
    return () => { /* keep singleton alive across screens */ }
  }, [])

  // ── Subscribe to orchestrator events ──────────────────────────────────────
  useEffect(() => {
    const offOn  = orchestrator.on('ollama:online',  () => setOnline(true))
    const offOff = orchestrator.on('ollama:offline', () => setOnline(false))
    const offLs  = orchestrator.on('listening:start', () => setListening(true))
    const offLe  = orchestrator.on('listening:stop',  () => setListening(false))
    setOnline(orchestrator.ollamaOnline)
    return () => { offOn(); offOff(); offLs(); offLe() }
  }, [])

  // ── Drive frequency data into ParticleSphere while listening ──────────────
  useEffect(() => {
    if (!listening) {
      setFreqData(null)
      return
    }
    const tick = () => {
      const data = orchestrator.getFrequencyData()
      if (data.length > 0) setFreqData(data)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [listening])

  // ── Tick the clock ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleLock = () => {
    onLock?.()
    navigate('/lock')
  }

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()

  return (
    <div
      className="fixed inset-0 bg-iris-void overflow-hidden flex"
      style={{ paddingTop: 28 }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
           style={{
             backgroundImage:
               'linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)',
             backgroundSize: '48px 48px',
           }}
      />
      {/* Soft radial vignette */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             background:
               'radial-gradient(circle at 50% 60%, rgba(16,185,129,0.06), transparent 60%)',
           }}
      />

      {/* ── Left column: Memory Stream ───────────────────────────────────── */}
      <aside className="relative z-10 p-3 h-full" style={{ width: 320 }}>
        <div
          className={`${PANEL} h-full overflow-hidden`}
          style={listening ? { boxShadow: ACTIVE_GLOW } : undefined}
        >
          <ChatSidebar />
        </div>
      </aside>

      {/* ── Center column: Sphere + Mic ──────────────────────────────────── */}
      <main className="relative z-10 flex-1 p-3 flex flex-col">
        {/* Top status bar */}
        <div className="flex items-center justify-between px-2 pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono font-black tracking-[0.5em] text-emerald-400 text-base">
              IRIS
            </span>
            <span className="font-mono text-zinc-700 text-[10px] tracking-[0.3em]">
              // JASRAJ
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.3em]">
            <span className="text-zinc-500">{date}</span>
            <span className="text-emerald-400 tabular-nums">{time}</span>
            <button
              onClick={handleLock}
              className="px-3 py-1 border border-zinc-700 text-zinc-400 rounded-full
                         hover:border-emerald-400 hover:text-emerald-400 transition-all"
            >
              LOCK
            </button>
          </div>
        </div>

        {/* Sphere stage */}
        <div
          className={`${PANEL} flex-1 relative overflow-hidden`}
          style={listening ? { boxShadow: ACTIVE_GLOW } : undefined}
        >
          <div className="absolute inset-0">
            <ParticleSphere frequencyData={freqData} listening={listening} />
          </div>

          {/* HUD status above sphere */}
          <div className="absolute top-4 left-4 flex flex-col gap-1 font-mono">
            <span className="text-zinc-600 text-[9px] tracking-[0.4em]">STATE</span>
            <span className={`text-[11px] tracking-widest ${
              listening ? 'text-iris-error' : online ? 'text-emerald-400' : 'text-zinc-500'
            }`}>
              {listening ? 'LISTENING' : online ? 'STANDBY' : 'OFFLINE'}
            </span>
          </div>
          <div className="absolute top-4 right-4 flex flex-col items-end gap-1 font-mono">
            <span className="text-zinc-600 text-[9px] tracking-[0.4em]">MODEL</span>
            <span className="text-emerald-400 text-[11px] tracking-widest">
              {orchestrator.activeModel.toUpperCase()}
            </span>
          </div>

          {/* Mic anchored bottom-center */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            <MicButton disabled={!online} />
          </div>
        </div>
      </main>

      {/* ── Right column: Stats + Ollama ─────────────────────────────────── */}
      <aside className="relative z-10 p-3 h-full flex flex-col gap-3" style={{ width: 280 }}>
        <div className={`${PANEL} p-4`}>
          <OllamaStatus />
        </div>
        <div
          className={`${PANEL} p-4 flex-1 overflow-y-auto`}
          style={listening ? { boxShadow: ACTIVE_GLOW } : undefined}
        >
          <SystemStats />
        </div>
        <div className="px-4 py-3 text-center">
          <p className="font-mono text-zinc-700 text-[9px] tracking-[0.3em]">
            ALL INFERENCE LOCAL · NO TELEMETRY
          </p>
        </div>
      </aside>
    </div>
  )
}

export default Dashboard
