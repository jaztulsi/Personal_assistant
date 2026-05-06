import { BrowserRouter, Routes, Route } from 'react-router-dom'

// IRIS // JASRAJ
export function App() {
  return (
    <BrowserRouter>
      <div className="w-full h-full bg-iris-void text-iris-text flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-mono font-bold text-iris-emerald tracking-widest">
              IRIS
            </h1>
            <p className="text-iris-muted text-sm tracking-[0.3em] uppercase">
              Intelligent Runtime Interface System
            </p>
            <p className="text-iris-muted text-xs tracking-widest opacity-50">
              // JASRAJ
            </p>
          </div>
        </div>
      </div>
    </BrowserRouter>
  )
}
