// IRIS ChatSidebar — "MEMORY STREAM" // JASRAJ
//
// Live transcript of the conversation between the user and IRIS.
// Capped at 20 turns. Streams the assistant reply with a blinking cursor.
// Shows an offline banner when Ollama is unreachable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'

import { orchestrator } from '../core/IRISOrchestrator'

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

const HISTORY_CAP = 20

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatSidebar() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [online, setOnline] = useState<boolean>(orchestrator.ollamaOnline)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const streamingIdRef = useRef<string | null>(null)

  // ── Subscribe to orchestrator events ──────────────────────────────────────
  useEffect(() => {
    const offChunk = orchestrator.on('stream:chunk', (payload) => {
      const p = payload as { full: string }
      const id = streamingIdRef.current
      if (!id) return
      setTurns((prev) => prev.map((t) =>
        t.id === id ? { ...t, text: p.full, streaming: true } : t
      ))
    })

    const offComplete = orchestrator.on('stream:complete', (payload) => {
      const p = payload as { full: string }
      const id = streamingIdRef.current
      if (!id) return
      setTurns((prev) => prev.map((t) =>
        t.id === id ? { ...t, text: p.full, streaming: false } : t
      ))
      streamingIdRef.current = null
      setSending(false)
    })

    const offOnline  = orchestrator.on('ollama:online',  () => setOnline(true))
    const offOffline = orchestrator.on('ollama:offline', () => setOnline(false))

    return () => { offChunk(); offComplete(); offOnline(); offOffline() }
  }, [])

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  // Cap turn list to last HISTORY_CAP entries
  const visibleTurns = useMemo(
    () => turns.slice(-HISTORY_CAP),
    [turns]
  )

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    setSending(true)

    const userTurn: Turn = { id: makeId(), role: 'user', text }
    const assistantTurn: Turn = { id: makeId(), role: 'assistant', text: '', streaming: true }
    streamingIdRef.current = assistantTurn.id

    setTurns((prev) => [...prev, userTurn, assistantTurn])

    try {
      await orchestrator.sendText(text)
    } catch {
      setTurns((prev) => prev.map((t) =>
        t.id === assistantTurn.id
          ? { ...t, text: t.text || 'IRIS: chat failed.', streaming: false }
          : t
      ))
      streamingIdRef.current = null
      setSending(false)
    }
  }, [draft, sending])

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex flex-col h-full font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                style={{ boxShadow: '0 0 6px #10b981' }} />
          <span className="text-emerald-400 text-[10px] tracking-[0.4em]">MEMORY STREAM</span>
        </div>
        <span className="text-zinc-600 text-[9px] tracking-[0.3em]">{visibleTurns.length}/{HISTORY_CAP}</span>
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="mx-3 mt-3 rounded-lg border border-iris-error/30 bg-iris-error/5 p-3">
          <p className="text-iris-error text-[10px] tracking-widest uppercase">
            IRIS IS OFFLINE
          </p>
          <p className="mt-1 text-zinc-400 text-[10px] tracking-wide">
            Run: <span className="text-emerald-400">ollama serve</span>
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        {visibleTurns.length === 0 && (
          <div className="text-zinc-700 text-[10px] tracking-[0.3em] uppercase text-center mt-8">
            no transcript yet
          </div>
        )}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          className="flex flex-col gap-3"
        >
          {visibleTurns.map((t) => (
            <Bubble key={t.id} turn={t} />
          ))}
        </motion.div>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={online ? 'ASK IRIS...' : 'OLLAMA OFFLINE'}
            disabled={!online || sending}
            className="flex-1 bg-zinc-900/60 border border-white/5 rounded-lg
                       px-3 py-2 text-[11px] tracking-wide text-zinc-200
                       placeholder:text-zinc-600 placeholder:tracking-widest
                       focus:outline-none focus:border-emerald-400/40
                       disabled:opacity-40"
          />
          <button
            onClick={() => void send()}
            disabled={!online || sending || !draft.trim()}
            className="px-3 py-2 border border-emerald-400 text-emerald-400 text-[10px]
                       tracking-[0.3em] rounded-lg hover:bg-emerald-400/10 transition-all
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending ? '...' : 'SEND'}
          </button>
        </div>
      </div>

      {/* Local cursor blink */}
      <style>{`
        @keyframes iris-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .iris-cursor::after {
          content: '▍';
          margin-left: 2px;
          animation: iris-blink 1s steps(1) infinite;
          color: #34d399;
        }
      `}</style>
    </div>
  )
}

// ── Bubble ──────────────────────────────────────────────────────────────────

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user'
  return (
    <motion.div
      variants={{
        hidden:  { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[88%] px-3 py-2 rounded-lg text-[11px] leading-relaxed tracking-wide
          ${isUser
            ? 'border-l-2 border-emerald-400 bg-zinc-900/60 text-emerald-100'
            : 'border-l-2 border-cyan-400 bg-zinc-950/60 text-zinc-200'}
        `}
      >
        <div className="text-[8px] tracking-[0.4em] uppercase mb-1 opacity-50">
          {isUser ? 'YOU' : 'IRIS'}
        </div>
        <div className={turn.streaming ? 'iris-cursor whitespace-pre-wrap' : 'whitespace-pre-wrap'}>
          {turn.text || (turn.streaming ? '' : ' ')}
        </div>
      </div>
    </motion.div>
  )
}

export default ChatSidebar
