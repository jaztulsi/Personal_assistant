// IRIS Lock Screen — Touch ID → Face → PIN. macOS-styled. // JASRAJ

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'

import { faceAuth } from '../core/FaceAuth'
import type { AuthMethods } from '@shared/types'

type Stage = 'boot' | 'touchid' | 'face' | 'pin' | 'success'

const FACE_STATUS_CYCLE = ['SCANNING...', 'ANALYZING...', 'COMPARING...']
const MAX_FACE_FAILS = 3
const PIN_LENGTH = 6

interface Props {
  onAuthenticated?: () => void
}

export function LockScreen({ onAuthenticated }: Props) {
  const navigate = useNavigate()

  const [methods, setMethods] = useState<AuthMethods>({ touchId: false, face: false, pin: false })
  const [stage, setStage] = useState<Stage>('boot')
  const [faceStatusIdx, setFaceStatusIdx] = useState(0)
  const [faceFails, setFaceFails] = useState(0)
  const [pinDigits, setPinDigits] = useState<string>('')
  const [pinError, setPinError] = useState(false)
  const [exiting, setExiting] = useState(false)

  const screenRef = useRef<HTMLDivElement | null>(null)
  const laserRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Laser scanning animation (GSAP) ────────────────────────────────────────
  useEffect(() => {
    if (!laserRef.current) return
    const tween = gsap.fromTo(
      laserRef.current,
      { y: 0 },
      {
        y: '100vh',
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }
    )
    return () => { tween.kill() }
  }, [])

  // ── Pick auth method on mount ──────────────────────────────────────────────
  const succeed = useCallback(() => {
    setStage('success')
    setExiting(true)
    setTimeout(() => {
      onAuthenticated?.()
      navigate('/dashboard')
    }, 400)
  }, [navigate, onAuthenticated])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await window.iris.auth.getAvailableMethods()
      const m = r.success && r.data ? r.data : { touchId: false, face: false, pin: false }
      if (cancelled) return
      setMethods(m)

      if (m.touchId) {
        setStage('touchid')
        const t = await window.iris.auth.touchID()
        if (cancelled) return
        if (t.success && t.data === true) { succeed(); return }
        // Touch ID failed/cancelled → next method
        if (m.face) setStage('face')
        else setStage('pin')
      } else if (m.face) {
        setStage('face')
      } else {
        setStage('pin')
      }
    })()
    return () => { cancelled = true }
  }, [succeed])

  // ── Face recognition flow ─────────────────────────────────────────────────
  const startFaceRecognition = useCallback(async () => {
    const ok = await faceAuth.load()
    if (!ok) { setStage('pin'); return }

    const stream = await faceAuth.openCamera()
    if (!stream) { setStage('pin'); return }
    cameraStreamRef.current = stream

    if (videoRef.current) {
      videoRef.current.srcObject = stream
      try { await videoRef.current.play() } catch { /* autoplay block */ }
    }

    statusIntervalRef.current = setInterval(() => {
      setFaceStatusIdx((i) => (i + 1) % FACE_STATUS_CYCLE.length)
    }, 900)

    verifyIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return
      const { matched } = await faceAuth.verify(videoRef.current)
      if (matched) {
        stopFaceRecognition()
        succeed()
        return
      }
      setFaceFails((n) => {
        const next = n + 1
        if (next >= MAX_FACE_FAILS) {
          stopFaceRecognition()
          setStage('pin')
        }
        return next
      })
    }, 1500)
  }, [succeed])

  const stopFaceRecognition = useCallback(() => {
    if (verifyIntervalRef.current) { clearInterval(verifyIntervalRef.current); verifyIntervalRef.current = null }
    if (statusIntervalRef.current) { clearInterval(statusIntervalRef.current); statusIntervalRef.current = null }
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
  }, [])

  useEffect(() => {
    if (stage !== 'face') return
    void startFaceRecognition()
    return () => { stopFaceRecognition() }
  }, [stage, startFaceRecognition, stopFaceRecognition])

  useEffect(() => () => { stopFaceRecognition() }, [stopFaceRecognition])

  // ── PIN flow ──────────────────────────────────────────────────────────────
  const submitPin = useCallback(async (pin: string) => {
    const r = await window.iris.auth.verifyPin(pin)
    if (r.success && r.data === true) { succeed(); return }
    setPinError(true)
    setTimeout(() => { setPinDigits(''); setPinError(false) }, 600)
  }, [succeed])

  const onPinKey = useCallback((key: string) => {
    if (stage !== 'pin') return
    if (key === 'del') {
      setPinDigits((d) => d.slice(0, -1))
      return
    }
    if (key === 'submit') {
      if (pinDigits.length >= 4) void submitPin(pinDigits)
      return
    }
    setPinDigits((d) => {
      if (d.length >= PIN_LENGTH) return d
      const next = d + key
      if (next.length === PIN_LENGTH) void submitPin(next)
      return next
    })
  }, [stage, pinDigits, submitPin])

  // Keyboard support for PIN
  useEffect(() => {
    if (stage !== 'pin') return
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') onPinKey(e.key)
      else if (e.key === 'Backspace') onPinKey('del')
      else if (e.key === 'Enter') onPinKey('submit')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stage, onPinKey])

  const faceStatusText = useMemo(
    () => FACE_STATUS_CYCLE[faceStatusIdx] ?? FACE_STATUS_CYCLE[0]!,
    [faceStatusIdx]
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          ref={screenRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="fixed inset-0 bg-iris-void overflow-hidden flex flex-col items-center justify-center"
          style={{ paddingTop: 28 }}
        >
          {/* Laser scan line */}
          <div
            ref={laserRef}
            className="absolute left-0 right-0 h-px pointer-events-none"
            style={{
              top: 0,
              background: 'linear-gradient(90deg, transparent, #10b981 50%, transparent)',
              boxShadow: '0 0 20px #10b981, 0 0 40px #10b981',
            }}
          />

          {/* Vignette grid */}
          <div className="absolute inset-0 opacity-20 pointer-events-none"
               style={{
                 backgroundImage:
                   'linear-gradient(#10b98112 1px, transparent 1px), linear-gradient(90deg, #10b98112 1px, transparent 1px)',
                 backgroundSize: '40px 40px',
               }}
          />

          {/* Logo */}
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-center select-none"
          >
            <h1 className="font-mono font-black tracking-[0.5em] text-5xl text-emerald-400">
              IRIS
            </h1>
            <p className="mt-3 tracking-widest text-[10px] text-zinc-500">
              INTELLIGENT RUNTIME INTERFACE SYSTEM
            </p>
          </motion.div>

          {/* Stage content */}
          <div className="mt-16 w-full max-w-md flex flex-col items-center min-h-[260px]">
            {stage === 'touchid' && <TouchIDPanel />}
            {stage === 'face' && (
              <FacePanel videoRef={videoRef} status={faceStatusText} fails={faceFails} max={MAX_FACE_FAILS} />
            )}
            {stage === 'pin' && (
              <PinPanel
                digits={pinDigits}
                error={pinError}
                onKey={onPinKey}
                hasFace={methods.face}
                hasTouch={methods.touchId}
              />
            )}
            {stage === 'boot' && (
              <p className="text-zinc-500 text-xs tracking-[0.3em]">INITIALIZING...</p>
            )}
            {stage === 'success' && (
              <p className="text-emerald-400 text-sm tracking-[0.3em] animate-pulse">UNLOCKED</p>
            )}
          </div>

          {/* Footer */}
          <div className="absolute bottom-6 text-zinc-700 text-[10px] tracking-[0.3em]">
            BIOMETRIC DATA NEVER LEAVES THIS DEVICE
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Touch ID panel ──────────────────────────────────────────────────────────

function TouchIDPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="w-16 h-16 rounded-full border-2 border-emerald-400 flex items-center justify-center animate-iris-glow">
        {/* Touch ID glyph */}
        <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-emerald-400">
          <path d="M12 2c4.4 0 8 3.6 8 8v4M12 2C7.6 2 4 5.6 4 10v6M12 6c2.2 0 4 1.8 4 4v6M12 6c-2.2 0-4 1.8-4 4v6M12 10v6M8 22h8"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-emerald-400 text-xs tracking-[0.3em]">TOUCH ID TO UNLOCK</p>
    </motion.div>
  )
}

// ─── Face recognition panel ──────────────────────────────────────────────────

interface FacePanelProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: string
  fails: number
  max: number
}

function FacePanel({ videoRef, status, fails, max }: FacePanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="relative rounded-xl overflow-hidden border border-emerald-500/40"
           style={{ width: 160, height: 120, boxShadow: '0 0 24px #10b98140' }}>
        <video ref={videoRef} muted playsInline autoPlay
               className="w-full h-full object-cover -scale-x-100" />
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(180deg, transparent 60%, #10b98130)' }} />
      </div>
      <p className="text-emerald-400 text-[11px] tracking-[0.4em] font-mono">{status}</p>
      <p className="text-zinc-600 text-[10px] tracking-widest">
        ATTEMPT {Math.min(fails + 1, max)} / {max}
      </p>
    </motion.div>
  )
}

// ─── PIN pad ─────────────────────────────────────────────────────────────────

interface PinPanelProps {
  digits: string
  error: boolean
  onKey: (key: string) => void
  hasFace: boolean
  hasTouch: boolean
}

function PinPanel({ digits, error, onKey }: PinPanelProps) {
  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < digits.length)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6"
    >
      <p className="text-zinc-400 text-[10px] tracking-[0.4em]">ENTER PIN</p>
      <motion.div
        className="flex gap-3"
        animate={error ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        {dots.map((filled, i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              error ? 'bg-iris-error' : filled ? 'bg-emerald-400' : 'bg-zinc-700'
            }`}
            style={filled && !error ? { boxShadow: '0 0 6px #10b981' } : undefined}
          />
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map((n) => (
          <PinKey key={n} label={n} onClick={() => onKey(n)} />
        ))}
        <PinKey label="⌫" onClick={() => onKey('del')} muted />
        <PinKey label="0" onClick={() => onKey('0')} />
        <PinKey label="↵" onClick={() => onKey('submit')} accent />
      </div>
    </motion.div>
  )
}

interface PinKeyProps { label: string; onClick: () => void; accent?: boolean; muted?: boolean }

function PinKey({ label, onClick, accent, muted }: PinKeyProps) {
  const base = 'w-14 h-14 rounded-full border font-mono text-base flex items-center justify-center transition-all active:scale-95'
  const cls = accent
    ? 'border-emerald-400 text-emerald-400 hover:bg-emerald-400/10'
    : muted
    ? 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
    : 'border-zinc-700 text-zinc-200 hover:border-emerald-400 hover:text-emerald-400'
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      {label}
    </button>
  )
}

export default LockScreen
