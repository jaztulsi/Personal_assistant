// IRIS Setup Screen — first-run PIN + optional face enrollment // JASRAJ
//
// Step 1: pick PIN (4–6 digits)
// Step 2: confirm PIN
// Step 3: offer face enrollment (skippable). Face descriptors stay local.
// Step 4: done → navigate to /lock

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'

import { faceAuth } from '../core/FaceAuth'

type Step = 'intro' | 'pin' | 'pin-confirm' | 'face-prompt' | 'face-enroll' | 'done'

const PIN_MIN = 4
const PIN_MAX = 6
const FACE_SAMPLES = 3

interface Props {
  onComplete?: () => void
}

export function SetupScreen({ onComplete }: Props) {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('intro')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [faceProgress, setFaceProgress] = useState(0)
  const [faceMessage, setFaceMessage] = useState('LOOK AT THE CAMERA')
  const [faceError, setFaceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const laserRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const enrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Laser bg
  useEffect(() => {
    if (!laserRef.current) return
    const tween = gsap.fromTo(
      laserRef.current,
      { y: 0 },
      { y: '100vh', duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' }
    )
    return () => { tween.kill() }
  }, [])

  // Cleanup camera if we leave the face step
  const stopCamera = useCallback(() => {
    if (enrollIntervalRef.current) {
      clearInterval(enrollIntervalRef.current)
      enrollIntervalRef.current = null
    }
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
  }, [])

  useEffect(() => () => { stopCamera() }, [stopCamera])

  // ── PIN entry ─────────────────────────────────────────────────────────────
  const onDigit = useCallback((digit: string) => {
    setPinError(null)
    const target = step === 'pin' ? pin : confirm
    const setter = step === 'pin' ? setPin : setConfirm
    if (digit === 'del') { setter(target.slice(0, -1)); return }
    if (target.length >= PIN_MAX) return
    setter(target + digit)
  }, [step, pin, confirm])

  const onPinNext = useCallback(() => {
    if (pin.length < PIN_MIN) {
      setPinError(`PIN MUST BE AT LEAST ${PIN_MIN} DIGITS`)
      return
    }
    setStep('pin-confirm')
  }, [pin])

  const onConfirmNext = useCallback(async () => {
    if (confirm !== pin) {
      setPinError('PINS DO NOT MATCH')
      setConfirm('')
      return
    }
    setBusy(true)
    const r = await window.iris.auth.setPin(pin)
    setBusy(false)
    if (!r.success) {
      setPinError(r.error?.toUpperCase() ?? 'COULD NOT SAVE PIN')
      return
    }
    setStep('face-prompt')
  }, [pin, confirm])

  // Keyboard PIN support
  useEffect(() => {
    if (step !== 'pin' && step !== 'pin-confirm') return
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') onDigit(e.key)
      else if (e.key === 'Backspace') onDigit('del')
      else if (e.key === 'Enter') {
        if (step === 'pin') onPinNext()
        else void onConfirmNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, onDigit, onPinNext, onConfirmNext])

  // ── Face enrollment ───────────────────────────────────────────────────────
  const startFaceEnroll = useCallback(async () => {
    setFaceError(null)
    setFaceProgress(0)
    setFaceMessage('LOADING MODELS...')

    const ok = await faceAuth.load()
    if (!ok) {
      setFaceError('FACE MODELS NOT AVAILABLE — SKIPPING')
      setTimeout(() => finishSetup(), 900)
      return
    }

    setFaceMessage('REQUESTING CAMERA...')
    const stream = await faceAuth.openCamera()
    if (!stream) {
      setFaceError('CAMERA ACCESS DENIED — SKIPPING')
      setTimeout(() => finishSetup(), 900)
      return
    }
    cameraStreamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      try { await videoRef.current.play() } catch { /* autoplay block ok */ }
    }

    setFaceMessage('HOLD STILL...')
    let captured = 0
    enrollIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return
      const r = await faceAuth.enroll(videoRef.current)
      if (!r.ok) {
        setFaceMessage(r.error === 'no_face' ? 'NO FACE DETECTED' : 'TRY AGAIN')
        return
      }
      captured += 1
      setFaceProgress(captured)
      setFaceMessage(`CAPTURED ${captured} / ${FACE_SAMPLES}`)
      if (captured >= FACE_SAMPLES) {
        if (enrollIntervalRef.current) {
          clearInterval(enrollIntervalRef.current)
          enrollIntervalRef.current = null
        }
        stopCamera()
        setFaceMessage('FACE ENROLLED')
        setTimeout(() => finishSetup(), 700)
      }
    }, 1100)
  }, [stopCamera])

  const skipFace = useCallback(() => {
    stopCamera()
    finishSetup()
  }, [stopCamera])

  const finishSetup = useCallback(() => {
    setStep('done')
    setTimeout(() => {
      onComplete?.()
      navigate('/lock')
    }, 700)
  }, [navigate, onComplete])

  useEffect(() => {
    if (step === 'face-enroll') void startFaceEnroll()
  }, [step, startFaceEnroll])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-iris-void overflow-hidden flex flex-col items-center justify-center"
      style={{ paddingTop: 28 }}
    >
      {/* Laser */}
      <div
        ref={laserRef}
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{
          top: 0,
          background: 'linear-gradient(90deg, transparent, #10b981 50%, transparent)',
          boxShadow: '0 0 20px #10b981, 0 0 40px #10b981',
        }}
      />
      {/* Grid */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
           style={{
             backgroundImage:
               'linear-gradient(#10b98112 1px, transparent 1px), linear-gradient(90deg, #10b98112 1px, transparent 1px)',
             backgroundSize: '40px 40px',
           }}
      />

      {/* Header */}
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center select-none"
      >
        <h1 className="font-mono font-black tracking-[0.5em] text-5xl text-emerald-400">
          IRIS
        </h1>
        <p className="mt-3 tracking-widest text-[10px] text-zinc-500">
          FIRST-RUN SETUP
        </p>
      </motion.div>

      {/* Content */}
      <div className="mt-14 w-full max-w-md flex flex-col items-center min-h-[320px]">
        {/* No `mode="wait"`: under React 19, framer-motion 12 intermittently
            never fires the exit-complete callback for the leaving child, which
            traps the screen on the previous step. Letting them cross-fade is a
            small visual loss for full reliability. */}
        <AnimatePresence>
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <p className="text-zinc-300 text-sm tracking-widest leading-relaxed max-w-xs">
                LET&apos;S SECURE YOUR DEVICE.<br />
                A PIN IS REQUIRED. FACE UNLOCK IS OPTIONAL.
              </p>
              <p className="text-zinc-600 text-[10px] tracking-[0.3em] max-w-xs">
                ALL CREDENTIALS ARE STORED LOCALLY AND ENCRYPTED.
                NOTHING IS SENT OFF THIS DEVICE.
              </p>
              <button
                onClick={() => setStep('pin')}
                className="mt-2 px-6 py-2 border border-emerald-400 text-emerald-400 text-xs tracking-[0.4em] rounded-full hover:bg-emerald-400/10 transition-all"
              >
                BEGIN
              </button>
            </motion.div>
          )}

          {(step === 'pin' || step === 'pin-confirm') && (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-6"
            >
              <p className="text-zinc-400 text-[10px] tracking-[0.4em]">
                {step === 'pin' ? 'CREATE A PIN' : 'CONFIRM YOUR PIN'}
              </p>
              <PinDots value={step === 'pin' ? pin : confirm} length={PIN_MAX} error={!!pinError} />
              <PinPad onKey={onDigit} />
              {pinError && (
                <p className="text-iris-error text-[10px] tracking-[0.3em]">{pinError}</p>
              )}
              <div className="flex gap-3 mt-2">
                {step === 'pin-confirm' && (
                  <button
                    onClick={() => { setStep('pin'); setConfirm(''); setPinError(null) }}
                    className="px-5 py-2 border border-zinc-700 text-zinc-400 text-[10px] tracking-[0.4em] rounded-full hover:border-zinc-500 transition-all"
                  >
                    BACK
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => step === 'pin' ? onPinNext() : void onConfirmNext()}
                  className="px-6 py-2 border border-emerald-400 text-emerald-400 text-[10px] tracking-[0.4em] rounded-full hover:bg-emerald-400/10 transition-all disabled:opacity-40"
                >
                  {step === 'pin' ? 'NEXT' : busy ? 'SAVING...' : 'CONFIRM'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'face-prompt' && (
            <motion.div
              key="face-prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <p className="text-emerald-400 text-xs tracking-[0.4em]">PIN SAVED</p>
              <p className="text-zinc-300 text-sm tracking-widest leading-relaxed max-w-xs">
                ENROLL YOUR FACE FOR FASTER UNLOCK?
              </p>
              <p className="text-zinc-600 text-[10px] tracking-[0.3em] max-w-xs">
                A 128-DIM DESCRIPTOR IS STORED LOCALLY.
                YOUR PHOTOS NEVER LEAVE THIS DEVICE.
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={skipFace}
                  className="px-5 py-2 border border-zinc-700 text-zinc-400 text-[10px] tracking-[0.4em] rounded-full hover:border-zinc-500 transition-all"
                >
                  SKIP
                </button>
                <button
                  onClick={() => setStep('face-enroll')}
                  className="px-6 py-2 border border-emerald-400 text-emerald-400 text-[10px] tracking-[0.4em] rounded-full hover:bg-emerald-400/10 transition-all"
                >
                  ENROLL FACE
                </button>
              </div>
            </motion.div>
          )}

          {step === 'face-enroll' && (
            <motion.div
              key="face-enroll"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative rounded-xl overflow-hidden border border-emerald-500/40"
                   style={{ width: 200, height: 150, boxShadow: '0 0 24px #10b98140' }}>
                <video ref={videoRef} muted playsInline autoPlay
                       className="w-full h-full object-cover -scale-x-100" />
                <div className="absolute inset-0 pointer-events-none"
                     style={{ background: 'linear-gradient(180deg, transparent 60%, #10b98130)' }} />
              </div>
              <p className="text-emerald-400 text-[11px] tracking-[0.4em] font-mono">{faceMessage}</p>
              <FaceProgress current={faceProgress} total={FACE_SAMPLES} />
              {faceError && (
                <p className="text-iris-error text-[10px] tracking-[0.3em]">{faceError}</p>
              )}
              <button
                onClick={skipFace}
                className="mt-2 px-5 py-2 border border-zinc-700 text-zinc-400 text-[10px] tracking-[0.4em] rounded-full hover:border-zinc-500 transition-all"
              >
                CANCEL
              </button>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <p className="text-emerald-400 text-sm tracking-[0.4em] animate-pulse">SETUP COMPLETE</p>
              <p className="text-zinc-600 text-[10px] tracking-[0.3em]">UNLOCKING IRIS...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-zinc-700 text-[10px] tracking-[0.3em]">
        BIOMETRIC DATA NEVER LEAVES THIS DEVICE
      </div>
    </div>
  )
}

// ── PIN dots ────────────────────────────────────────────────────────────────

interface PinDotsProps { value: string; length: number; error: boolean }

function PinDots({ value, length, error }: PinDotsProps) {
  return (
    <motion.div
      className="flex gap-3"
      animate={error ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
    >
      {Array.from({ length }, (_, i) => i < value.length).map((filled, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-full transition-colors ${
            error ? 'bg-iris-error' : filled ? 'bg-emerald-400' : 'bg-zinc-700'
          }`}
          style={filled && !error ? { boxShadow: '0 0 6px #10b981' } : undefined}
        />
      ))}
    </motion.div>
  )
}

// ── PIN pad ─────────────────────────────────────────────────────────────────

interface PinPadProps { onKey: (key: string) => void }

function PinPad({ onKey }: PinPadProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {['1','2','3','4','5','6','7','8','9'].map((n) => (
        <PinKey key={n} label={n} onClick={() => onKey(n)} />
      ))}
      <PinKey label="⌫" onClick={() => onKey('del')} muted />
      <PinKey label="0" onClick={() => onKey('0')} />
      <span />
    </div>
  )
}

interface PinKeyProps { label: string; onClick: () => void; muted?: boolean }

function PinKey({ label, onClick, muted }: PinKeyProps) {
  const base =
    'w-14 h-14 rounded-full border font-mono text-base flex items-center justify-center transition-all active:scale-95'
  const cls = muted
    ? 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
    : 'border-zinc-700 text-zinc-200 hover:border-emerald-400 hover:text-emerald-400'
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      {label}
    </button>
  )
}

// ── Face progress bar ───────────────────────────────────────────────────────

interface FaceProgressProps { current: number; total: number }

function FaceProgress({ current, total }: FaceProgressProps) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`w-8 h-1 rounded-full transition-colors ${
            i < current ? 'bg-emerald-400' : 'bg-zinc-800'
          }`}
          style={i < current ? { boxShadow: '0 0 6px #10b981' } : undefined}
        />
      ))}
    </div>
  )
}

export default SetupScreen
