// IRIS MicButton — voice session toggle // JASRAJ
//
// Idle: emerald outline. Recording: red fill + concentric pulsing ring.
// Disabled when Ollama is offline. Keyboard shortcut: ⌘⇧I.

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { orchestrator } from '../core/IRISOrchestrator'

interface Props {
  /** Set by Dashboard from orchestrator.ollamaOnline so we can disable while offline. */
  disabled?: boolean
}

export function MicButton({ disabled }: Props) {
  const [recording, setRecording] = useState<boolean>(orchestrator.isRecording)

  // Subscribe to listen state
  useEffect(() => {
    const offStart = orchestrator.on('listening:start', () => setRecording(true))
    const offStop  = orchestrator.on('listening:stop',  () => setRecording(false))
    return () => { offStart(); offStop() }
  }, [])

  const toggle = useCallback(async () => {
    if (disabled) return
    if (recording) {
      await orchestrator.stopVoiceSession()
    } else {
      const r = await orchestrator.startVoiceSession()
      if (!r.ok) setRecording(false)
    }
  }, [recording, disabled])

  // ⌘⇧I global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        void toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  const tooltip = disabled ? 'Ollama offline' : recording ? 'Stop listening' : 'Start listening (⌘⇧I)'

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative">
        {/* Pulsing rings while recording */}
        <AnimatePresence>
          {recording && (
            <>
              <motion.span
                key="ring1"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 1.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full bg-iris-error/30 pointer-events-none"
              />
              <motion.span
                key="ring2"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                className="absolute inset-0 rounded-full bg-iris-error/20 pointer-events-none"
              />
            </>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={disabled}
          title={tooltip}
          aria-pressed={recording}
          className={`
            relative w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-300 active:scale-95
            ${disabled
              ? 'border border-zinc-800 text-zinc-700 cursor-not-allowed'
              : recording
              ? 'bg-iris-error border-2 border-iris-error text-white'
              : 'border-2 border-emerald-400 text-emerald-400 hover:bg-emerald-400/10'}
          `}
          style={
            !disabled && !recording
              ? { boxShadow: '0 0 24px rgba(52,211,153,0.2)' }
              : recording
              ? { boxShadow: '0 0 28px rgba(239,68,68,0.5)' }
              : undefined
          }
        >
          <MicIcon active={recording} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span className={`font-mono text-[10px] tracking-[0.4em] uppercase ${
          disabled ? 'text-zinc-700' : recording ? 'text-iris-error' : 'text-emerald-400'
        }`}>
          {disabled ? 'OFFLINE' : recording ? 'LISTENING' : 'TAP TO SPEAK'}
        </span>
        <span className="font-mono text-[9px] tracking-[0.5em] text-zinc-600">⌘⇧I</span>
      </div>
    </div>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7"
         stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3"
            fill={active ? 'currentColor' : 'none'} />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

export default MicButton
