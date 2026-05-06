import { systemPreferences } from 'electron'
import bcrypt from 'bcryptjs'
import type { IrisResponse } from '../../../shared/types'

let _store: InstanceType<typeof import('electron-store').default> | null = null

async function getStore() {
  if (!_store) {
    const Store = (await import('electron-store')).default
    _store = new Store({ name: 'iris-auth' })
  }
  return _store
}

export const authHandlers = {
  async setPin(_: unknown, pin: string): Promise<IrisResponse<void>> {
    const store = await getStore()
    const hash = await bcrypt.hash(pin, 12)
    store.set('pinHash', hash)
    return { success: true }
  },

  async verifyPin(_: unknown, pin: string): Promise<IrisResponse<{ valid: boolean }>> {
    const store = await getStore()
    const hash = store.get('pinHash') as string | undefined
    if (!hash) return { success: true, data: { valid: false } }
    const valid = await bcrypt.compare(pin, hash)
    return { success: true, data: { valid } }
  },

  async hasPin(): Promise<IrisResponse<boolean>> {
    const store = await getStore()
    return { success: true, data: !!store.get('pinHash') }
  },

  async touchID(): Promise<IrisResponse<{ success: boolean }>> {
    try {
      await systemPreferences.promptTouchID('Unlock IRIS')
      return { success: true, data: { success: true } }
    } catch {
      return { success: true, data: { success: false } }
    }
  },

  async canTouchID(): Promise<IrisResponse<boolean>> {
    return { success: true, data: systemPreferences.canPromptTouchID() }
  },

  async storeFace(_: unknown, descriptor: number[]): Promise<IrisResponse<void>> {
    const store = await getStore()
    store.set('faceDescriptor', descriptor)
    return { success: true }
  },

  async getFace(): Promise<IrisResponse<number[] | null>> {
    const store = await getStore()
    const descriptor = store.get('faceDescriptor') as number[] | undefined
    return { success: true, data: descriptor ?? null }
  },

  async hasFace(): Promise<IrisResponse<boolean>> {
    const store = await getStore()
    return { success: true, data: !!store.get('faceDescriptor') }
  },

  async clearFace(): Promise<IrisResponse<void>> {
    const store = await getStore()
    store.delete('faceDescriptor')
    return { success: true }
  },
}
