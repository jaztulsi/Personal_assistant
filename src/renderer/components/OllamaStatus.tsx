// IRIS OllamaStatus — local AI health pill + model switcher // JASRAJ
//
// Polls window.iris.ai.checkOllama() every 5000ms.
// Mirrors orchestrator.activeModel and dispatches switchModel().

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { OLLAMA_MODELS, orchestrator, type ModelKind } from '../core/IRISOrchestrator'
import { useIrisStore, irisStore } from '../store/useIrisStore'

const POLL_MS = 5000

const MODEL_LABELS: Record<ModelKind, { name: string; tag: string }> = {
  chat:   { name: 'CHAT',   tag: OLLAMA_MODELS.chat },
  fast:   { name: 'FAST',   tag: OLLAMA_MODELS.fast },
  vision: { name: 'VISION', tag: OLLAMA_MODELS.vision },
}

interface BridgeShape {
  iris?: {
    ai?: {
      checkOllama?: () => Promise<{
        success: boolean
        data?: { online: boolean; models: string[] }
      }>
    }
  }
}

/** Returns [online, models]. */
async function pingOllama(): Promise<[boolean, string[]]> {
  try {
    const ai = (window as unknown as BridgeShape).iris?.ai
    if (!ai?.checkOllama) return [false, []]
    const r = await ai.checkOllama()
    const ok = !!(r.success && r.data?.online === true)
    return [ok, r.data?.models ?? []]
  } catch {
    return [false, []]
  }
}

export function OllamaStatus() {
  // Read straight from the Zustand store — every other "offline" indicator
  // does the same, so they can never disagree.
  const online = useIrisStore((s) => s.ollamaOnline)
  const [kind, setKind] = useState<ModelKind>(orchestrator.activeKind)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Poll loop — writes directly to the store; no local mirror.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const [ok, models] = await pingOllama()
      if (!cancelled) irisStore.setOllama(ok, models)
    }
    void tick()
    const id = setInterval(tick, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Model dropdown still listens to orchestrator events.
  useEffect(() => {
    const offModel = orchestrator.on('model:changed', (payload) => {
      const p = payload as { kind: ModelKind }
      setKind(p.kind)
    })
    return () => { offModel() }
  }, [])

  // Click-outside to close dropdown
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onPick = useCallback(async (next: ModelKind) => {
    setOpen(false)
    if (next === kind) return
    await orchestrator.switchModel(next)
    setKind(next)
  }, [kind])

  const dotClass  = online ? 'bg-emerald-400' : 'bg-iris-error'
  const dotShadow = online ? '0 0 8px #10b981' : '0 0 8px #ef4444'
  const label     = online ? 'OLLAMA ONLINE' : 'OLLAMA OFFLINE'
  const labelCls  = online ? 'text-emerald-400' : 'text-iris-error'

  return (
    <div className="flex flex-col gap-3 font-mono">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} style={{ boxShadow: dotShadow }} />
          <span className={`tracking-widest uppercase text-[10px] ${labelCls}`}>{label}</span>
        </div>
      </div>

      {online ? (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                       border border-white/5 bg-zinc-900/40 hover:border-emerald-400/40
                       transition-all"
          >
            <div className="flex flex-col items-start">
              <span className="text-zinc-500 text-[9px] tracking-[0.3em]">MODEL</span>
              <span className="text-emerald-400 text-[11px] tracking-widest">
                {MODEL_LABELS[kind].name} · {MODEL_LABELS[kind].tag}
              </span>
            </div>
            <span className={`text-zinc-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 mt-1 rounded-lg border border-white/5
                           bg-zinc-950/95 backdrop-blur-xl shadow-xl z-30 overflow-hidden"
              >
                {(Object.keys(MODEL_LABELS) as ModelKind[]).map((k) => {
                  const active = k === kind
                  return (
                    <button
                      key={k}
                      onClick={() => void onPick(k)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left
                                  transition-colors ${
                                    active
                                      ? 'bg-emerald-400/10 text-emerald-400'
                                      : 'text-zinc-300 hover:bg-zinc-900/60 hover:text-emerald-400'
                                  }`}
                    >
                      <span className="text-[11px] tracking-widest">{MODEL_LABELS[k].name}</span>
                      <span className="text-[9px] tracking-[0.2em] opacity-70">{MODEL_LABELS[k].tag}</span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="px-3 py-2 rounded-lg border border-iris-error/30 bg-iris-error/5">
          <p className="text-iris-error text-[10px] tracking-widest uppercase">RUN: ollama serve</p>
          <p className="mt-1 text-zinc-500 text-[9px] tracking-[0.2em] uppercase">
            ALL INFERENCE IS LOCAL
          </p>
        </div>
      )}
    </div>
  )
}

export default OllamaStatus
