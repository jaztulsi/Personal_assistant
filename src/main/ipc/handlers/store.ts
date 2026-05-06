import type { IrisResponse } from '../../../shared/types'

let _store: InstanceType<typeof import('electron-store').default> | null = null

async function getStore() {
  if (!_store) {
    const Store = (await import('electron-store')).default
    _store = new Store({ name: 'iris-data' })
  }
  return _store
}

export const storeHandlers = {
  async get<T = unknown>(_: unknown, key: string): Promise<IrisResponse<T>> {
    const store = await getStore()
    const value = store.get(key) as T | undefined
    return { success: true, data: value }
  },

  async set(_: unknown, key: string, value: unknown): Promise<IrisResponse<void>> {
    const store = await getStore()
    store.set(key, value)
    return { success: true }
  },

  async delete(_: unknown, key: string): Promise<IrisResponse<void>> {
    const store = await getStore()
    store.delete(key)
    return { success: true }
  },

  async getVault<T = unknown>(_: unknown, key: string): Promise<IrisResponse<T>> {
    const { safeStorage } = await import('electron')
    const store = await getStore()
    const raw = store.get(`vault:${key}`) as string | undefined
    if (!raw) return { success: true, data: undefined }

    if (!safeStorage.isEncryptionAvailable()) {
      return { success: true, data: raw as unknown as T }
    }

    const buf = Buffer.from(raw, 'base64')
    const decrypted = safeStorage.decryptString(buf)
    return { success: true, data: decrypted as unknown as T }
  },

  async setVault(_: unknown, key: string, value: string): Promise<IrisResponse<void>> {
    const { safeStorage } = await import('electron')
    const store = await getStore()

    if (!safeStorage.isEncryptionAvailable()) {
      store.set(`vault:${key}`, value)
      return { success: true }
    }

    const encrypted = safeStorage.encryptString(value)
    store.set(`vault:${key}`, encrypted.toString('base64'))
    return { success: true }
  },
}
