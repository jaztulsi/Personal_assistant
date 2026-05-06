import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import { faceAuth } from '../core/FaceAuth'

// IRIS Lock Screen — Touch ID → Face → PIN // JASRAJ

type AuthStage = 'init' | 'touchid' | 'face' | 'pin' | 'success' | 'error'

interface LockScreenProps {
  onUnlock: () => void
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [stage, setStage] = useState<AuthStage>('init')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [statusText, setStatusText] = useState('Initializing...')
  const [hasPinSet, setHasPinSet] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [settingPin, setSettingPin] = useState<'enter' | 'confirm'>('enter')
  const [faceAvailable, setFaceAvailable] = useState(false)
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const laserRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ─── GSAP Intro Animation ──────────────────────────────────────────────

  useEffect(() => {
    if (!logoRef.current || !containerRef.current) return
    const tl = gsap.timeline()
    tl.fromTo(
      logoRef.current,
      { opacity: 0, scale: 0.8, y: 20 },
      { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: 'power3.out' }
    )
    tl.fromTo(
      containerRef.current.querySelectorAll('.fade-in-item'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out' },
      '-=0.3'
    )
    return () => { tl.kill() }
  }, [stage])

  // ─── Init Auth Chain ──────────────────────────────────────────────────

  useEffect(() => {
    initAuth()
  }, [])

  async function initAuth() {
    setStatusText('Checking authentication...')

    const [hasPinResult, canTouchResult, hasFaceResult] = await Promise.all([
      window.iris.auth.hasPin(),
      window.iris.auth.canTouchID(),
      window.iris.auth.hasFace(),
    ])

    const pinSet = hasPinResult.data === true
    const touchId = canTouchResult.data === true
    const faceEnrolled = hasFaceResult.data === true

    setHasPinSet(pinSet)
    setTouchIdAvailable(touchId)

    if (!pinSet) {
      setIsFirstRun(true)
      setStage('pin')
      setStatusText('Welcome to IRIS. Set your PIN.')
      return
    }

    if (faceEnrolled) {
      const inited = await faceAuth.init()
      setFaceAvailable(inited)
    }

    // Priority: Touch ID → Face → PIN
    if (touchId) {
      setStage('touchid')
      attemptTouchID()
    } else if (faceEnrolled && faceAuth.isAvailable()) {
      setStage('face')
      attemptFaceAuth()
    } else {
      setStage('pin')
      setStatusText('Enter PIN')
    }
  }

  // ─── Touch ID ─────────────────────────────────────────────────────────

  async function attemptTouchID() {
    setStatusText('Touch ID...')
    const result = await window.iris.auth.touchID()
    if (result.data?.success) {
      setStage('success')
      setStatusText('Authenticated')
      setTimeout(onUnlock, 600)
    } else {
      // Fall through to Face → PIN
      const hasFace = await window.iris.auth.hasFace()
      if (hasFace.data && faceAuth.isAvailable()) {
        setStage('face')
        attemptFaceAuth()
      } else {
        setStage('pin')
        setStatusText('Enter PIN')
      }
    }
  }

  // ─── Face Auth ────────────────────────────────────────────────────────

  async function attemptFaceAuth() {
    setStatusText('Scanning face...')
    setScanProgress(0)

    const inited = await faceAuth.init()
    if (!inited || !videoRef.current) {
      setStage('pin')
      setStatusText('Camera unavailable. Enter PIN.')
      return
    }

    const cameraStarted = await faceAuth.startCamera(videoRef.current)
    if (!cameraStarted) {
      setStage('pin')
      setStatusText('Camera access denied. Enter PIN.')
      return
    }

    startLaserScan()

    let attempts = 0
    const maxAttempts = 15
    const interval = setInterval(async () => {
      attempts++
      setScanProgress(Math.min((attempts / maxAttempts) * 100, 95))

      const result = await faceAuth.verify()
      if (result.matched) {
        clearInterval(interval)
        faceAuth.stopCamera()
        setScanProgress(100)
        setStage('success')
        setStatusText('Face matched')
        setTimeout(onUnlock, 600)
        return
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval)
        faceAuth.stopCamera()
        setStage('pin')
        setStatusText('Face not recognized. Enter PIN.')
      }
    }, 400)
  }

  function startLaserScan() {
    if (!laserRef.current) return
    gsap.fromTo(
      laserRef.current,
      { top: '0%' },
      {
        top: '100%',
        duration: 2,
        ease: 'power1.inOut',
        repeat: -1,
        yoyo: true,
      }
    )
  }

  // ─── PIN ──────────────────────────────────────────────────────────────

  const handlePinDigit = useCallback((digit: string) => {
    if (isFirstRun) {
      if (settingPin === 'enter') {
        const next = newPin + digit
        setNewPin(next)
        if (next.length === 6) {
          setSettingPin('confirm')
          setStatusText('Confirm your PIN')
        }
      } else {
        const next = confirmPin + digit
        setConfirmPin(next)
        if (next.length === 6) {
          if (next === newPin) {
            window.iris.auth.setPin(next).then(() => {
              setHasPinSet(true)
              setIsFirstRun(false)
              setStage('success')
              setStatusText('PIN set. Welcome to IRIS.')
              setTimeout(onUnlock, 800)
            })
          } else {
            setPinError(true)
            setStatusText('PINs don\'t match. Try again.')
            setNewPin('')
            setConfirmPin('')
            setSettingPin('enter')
            setTimeout(() => setPinError(false), 600)
          }
        }
      }
      return
    }

    const next = pin + digit
    setPin(next)
    if (next.length === 6) {
      verifyPin(next)
    }
  }, [pin, isFirstRun, newPin, confirmPin, settingPin])

  const handlePinDelete = useCallback(() => {
    if (isFirstRun) {
      if (settingPin === 'confirm') {
        setConfirmPin((p) => p.slice(0, -1))
      } else {
        setNewPin((p) => p.slice(0, -1))
      }
    } else {
      setPin((p) => p.slice(0, -1))
    }
  }, [isFirstRun, settingPin])

  async function verifyPin(value: string) {
    const result = await window.iris.auth.verifyPin(value)
    if (result.data?.valid) {
      setStage('success')
      setStatusText('Authenticated')
      setTimeout(onUnlock, 600)
    } else {
      setPinError(true)
      setPin('')
      setStatusText('Wrong PIN')
      setTimeout(() => {
        setPinError(false)
        setStatusText('Enter PIN')
      }, 1000)
    }
  }

  // ─── Keyboard Input ───────────────────────────────────────────────────

  useEffect(() => {
    if (stage !== 'pin') return
    function handleKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        handlePinDigit(e.key)
      } else if (e.key === 'Backspace') {
        handlePinDelete()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [stage, handlePinDigit, handlePinDelete])

  // ─── Current PIN dots ─────────────────────────────────────────────────

  const currentPinValue = isFirstRun
    ? (settingPin === 'confirm' ? confirmPin : newPin)
    : pin

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl select-none"
      style={{ paddingTop: 28 }}
    >
      {/* IRIS Logo */}
      <div ref={logoRef} className="mb-8">
        <motion.div
          className="text-5xl font-mono font-bold tracking-[0.4em] text-iris-emerald"
          animate={stage === 'success' ? { scale: [1, 1.1, 1], opacity: [1, 0.8, 1] } : {}}
          transition={{ duration: 0.6 }}
        >
          IRIS
        </motion.div>
        <div className="text-xs text-iris-muted tracking-[0.3em] text-center mt-2 uppercase">
          {stage === 'success' ? 'Welcome back' : 'Intelligent Runtime Interface System'}
        </div>
      </div>

      {/* Status Text */}
      <motion.div
        className="text-sm text-iris-muted mb-6 fade-in-item h-5"
        key={statusText}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {statusText}
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ─── Touch ID Stage ─────────────────────────────────── */}
        {stage === 'touchid' && (
          <motion.div
            key="touchid"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6"
          >
            <motion.div
              className="w-16 h-16 rounded-2xl border-2 border-iris-emerald/40 flex items-center justify-center"
              animate={{ borderColor: ['rgba(16,185,129,0.4)', 'rgba(16,185,129,0.8)', 'rgba(16,185,129,0.4)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                <path d="M12 10v4M7.5 15.5c0-3.5 1.5-8 4.5-8s4.5 4.5 4.5 8" />
                <path d="M5.5 15c0-5 2.5-11 6.5-11s6.5 6 6.5 11" />
                <path d="M9.5 15.5c0-2 1-5.5 2.5-5.5s2.5 3.5 2.5 5.5" />
              </svg>
            </motion.div>
            <button
              onClick={() => { setStage('pin'); setStatusText('Enter PIN') }}
              className="text-xs text-iris-muted hover:text-iris-emerald transition-colors"
            >
              Use PIN instead
            </button>
          </motion.div>
        )}

        {/* ─── Face Auth Stage ────────────────────────────────── */}
        {stage === 'face' && (
          <motion.div
            key="face"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="relative w-48 h-48 rounded-2xl overflow-hidden border border-iris-emerald/30">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
              {/* Laser scan line */}
              <div
                ref={laserRef}
                className="absolute left-0 right-0 h-[2px] bg-iris-emerald shadow-[0_0_8px_#10b981,0_0_20px_#10b981]"
                style={{ top: '0%' }}
              />
              {/* Corner brackets */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-iris-emerald/60" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-iris-emerald/60" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-iris-emerald/60" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-iris-emerald/60" />
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-iris-emerald rounded-full"
                animate={{ width: `${scanProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <button
              onClick={() => {
                faceAuth.stopCamera()
                setStage('pin')
                setStatusText('Enter PIN')
              }}
              className="text-xs text-iris-muted hover:text-iris-emerald transition-colors"
            >
              Use PIN instead
            </button>
          </motion.div>
        )}

        {/* ─── PIN Stage ──────────────────────────────────────── */}
        {stage === 'pin' && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-6"
          >
            {/* PIN Dots */}
            <motion.div
              className="flex gap-3"
              animate={pinError ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                    pinError
                      ? 'border-iris-error bg-iris-error'
                      : i < currentPinValue.length
                        ? 'border-iris-emerald bg-iris-emerald shadow-[0_0_8px_#10b981]'
                        : 'border-iris-muted/40 bg-transparent'
                  }`}
                />
              ))}
            </motion.div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key) => {
                if (key === '') return <div key="empty" />
                return (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => key === '⌫' ? handlePinDelete() : handlePinDigit(key)}
                    className={`w-16 h-16 rounded-2xl font-mono text-xl flex items-center justify-center transition-all
                      ${key === '⌫'
                        ? 'text-iris-muted hover:text-iris-text bg-transparent hover:bg-white/5'
                        : 'text-iris-text bg-white/5 hover:bg-white/10 active:bg-iris-emerald/20 border border-white/5 hover:border-iris-emerald/30'
                      }`}
                  >
                    {key}
                  </motion.button>
                )
              })}
            </div>

            {/* Alternative auth options */}
            <div className="flex gap-4 mt-2">
              {touchIdAvailable && !isFirstRun && (
                <button
                  onClick={() => { setStage('touchid'); attemptTouchID() }}
                  className="text-xs text-iris-muted hover:text-iris-emerald transition-colors flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 10v4M7.5 15.5c0-3.5 1.5-8 4.5-8s4.5 4.5 4.5 8" />
                    <path d="M5.5 15c0-5 2.5-11 6.5-11s6.5 6 6.5 11" />
                  </svg>
                  Touch ID
                </button>
              )}
              {faceAvailable && !isFirstRun && (
                <button
                  onClick={() => { setStage('face'); attemptFaceAuth() }}
                  className="text-xs text-iris-muted hover:text-iris-emerald transition-colors flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="9" cy="10" r="1" fill="currentColor" />
                    <circle cx="15" cy="10" r="1" fill="currentColor" />
                    <path d="M9 15c1.5 1.5 4.5 1.5 6 0" />
                  </svg>
                  Face ID
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Success Stage ──────────────────────────────────── */}
        {stage === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <motion.div
              className="w-16 h-16 rounded-full border-2 border-iris-emerald flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <motion.svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                />
              </motion.svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom branding */}
      <div className="absolute bottom-6 text-center">
        <div className="text-[10px] text-iris-muted/30 tracking-[0.4em] uppercase font-mono">
          // JASRAJ
        </div>
      </div>
    </div>
  )
}
