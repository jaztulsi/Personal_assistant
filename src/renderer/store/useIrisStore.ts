// IRIS — Renderer-wide Zustand store. Single source of truth for cross-cutting UI state. // JASRAJ
//
// Every "OLLAMA OFFLINE" / "IRIS IS OFFLINE" indicator reads `ollamaOnline` from
// here. Writers are:
//   • OllamaStatus.tsx poll loop (5s)
//   • IRISOrchestrator.pingOllama / healthTick (5s watchdog)
//
// Both compute the same boolean from the same IPC call, so contention is fine.

import { create } from 'zustand'

export interface IrisStore {
  // Health
  ollamaOnline: boolean
  ollamaModels: string[]
  setOllama: (online: boolean, models?: string[]) => void
}

export const useIrisStore = create<IrisStore>((set) => ({
  ollamaOnline: false,
  ollamaModels: [],
  setOllama: (online, models) =>
    set((s) => ({
      ollamaOnline: online,
      ollamaModels: models ?? s.ollamaModels,
    })),
}))

// Non-React accessors so non-component code (orchestrator, sync layer) can read/write.
export const irisStore = {
  get ollamaOnline(): boolean { return useIrisStore.getState().ollamaOnline },
  setOllama(online: boolean, models?: string[]): void {
    useIrisStore.getState().setOllama(online, models)
  },
}
