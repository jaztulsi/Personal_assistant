import { useEffect, useState } from 'react'
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom'

import { LockScreen } from './screens/LockScreen'
import { SetupScreen } from './screens/SetupScreen'
import { Dashboard } from './pages/Dashboard'

// IRIS // JASRAJ

type BootState = 'checking' | 'needs-setup' | 'ready'

export function App() {
  const [boot, setBoot] = useState<BootState>('checking')
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await window.iris.auth.isSetup()
        if (cancelled) return
        const ready = r.success && r.data === true
        setBoot(ready ? 'ready' : 'needs-setup')
      } catch {
        if (!cancelled) setBoot('needs-setup')
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (boot === 'checking') return <BootSplash />

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Navigate to={boot === 'needs-setup' ? '/setup' : '/lock'} replace />
          }
        />

        <Route
          path="/setup"
          element={
            <SetupScreen
              onComplete={() => {
                setBoot('ready')
                setUnlocked(false)
              }}
            />
          }
        />

        <Route
          path="/lock"
          element={
            <LockScreenRoute
              onAuthenticated={() => setUnlocked(true)}
              needsSetup={boot === 'needs-setup'}
            />
          }
        />

        <Route
          path="/dashboard"
          element={
            unlocked ? (
              <Dashboard onLock={() => setUnlocked(false)} />
            ) : (
              <Navigate to="/lock" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface LockScreenRouteProps {
  onAuthenticated: () => void
  needsSetup: boolean
}

function LockScreenRoute({ onAuthenticated, needsSetup }: LockScreenRouteProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (needsSetup) navigate('/setup', { replace: true })
  }, [needsSetup, navigate])

  if (needsSetup) return null
  return <LockScreen onAuthenticated={onAuthenticated} />
}

function BootSplash() {
  return (
    <div
      className="fixed inset-0 bg-iris-void flex flex-col items-center justify-center"
      style={{ paddingTop: 28 }}
    >
      <h1 className="font-mono font-black tracking-[0.5em] text-5xl text-emerald-400">
        IRIS
      </h1>
      <p className="mt-4 text-zinc-600 text-[10px] tracking-[0.4em] animate-pulse">
        BOOTING...
      </p>
    </div>
  )
}
