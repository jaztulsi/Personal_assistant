import { systemPreferences } from 'electron'
import bcrypt from 'bcryptjs'
import type { IrisResponse, AuthMethods, FaceVerifyResult } from '../../../shared/types'

// IRIS Auth — Touch ID / Face / PIN. All data stays on device. // JASRAJ

const FACE_DESCRIPTORS_KEY = 'faceDescriptors'
const PIN_VAULT_KEY = 'iris.pin'
const FACE_THRESHOLD = 0.55

let _store: InstanceType<typeof import('electron-store').default> | null = null

async function getStore() {
  if (!_store) {
    const Store = (await import('electron-store')).default
    _store = new Store({ name: 'iris-data' })
  }
  return _store
}

function euclidean(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    sum += d * d
  }
  return Math.sqrt(sum)
}

async function readPinHash(): Promise<string | null> {
  const { safeStorage } = await import('electron')
  const store = await getStore()
  const raw = store.get(`vault:${PIN_VAULT_KEY}`) as string | undefined
  if (!raw) return null
  if (!safeStorage.isEncryptionAvailable()) return raw
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch {
    return null
  }
}

async function writePinHash(hash: string): Promise<void> {
  const { safeStorage } = await import('electron')
  const store = await getStore()
  if (!safeStorage.isEncryptionAvailable()) {
    store.set(`vault:${PIN_VAULT_KEY}`, hash)
    return
  }
  store.set(`vault:${PIN_VAULT_KEY}`, safeStorage.encryptString(hash).toString('base64'))
}

async function readDescriptors(): Promise<number[][]> {
  const store = await getStore()
  return (store.get(FACE_DESCRIPTORS_KEY) as number[][] | undefined) ?? []
}

async function writeDescriptors(list: number[][]): Promise<void> {
  const store = await getStore()
  store.set(FACE_DESCRIPTORS_KEY, list)
}

export const authHandlers = {
  async touchID(): Promise<IrisResponse<boolean>> {
    try {
      if (process.platform !== 'darwin' || !systemPreferences.canPromptTouchID()) {
        return { success: false, error: 'touch_id_unavailable' }
      }
      await systemPreferences.promptTouchID('Unlock IRIS')
      return { success: true, data: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },

  async enrollFace(_: unknown, descriptor: number[]): Promise<IrisResponse<{ count: number }>> {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return { success: false, error: 'invalid_descriptor' }
    }
    const list = await readDescriptors()
    list.push(descriptor)
    await writeDescriptors(list)
    return { success: true, data: { count: list.length } }
  },

  async verifyFace(_: unknown, descriptor: number[]): Promise<IrisResponse<FaceVerifyResult>> {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return { success: false, error: 'invalid_descriptor' }
    }
    const list = await readDescriptors()
    if (list.length === 0) return { success: true, data: { matched: false, confidence: 0 } }

    let best = Infinity
    for (const stored of list) {
      const d = euclidean(stored, descriptor)
      if (d < best) best = d
    }
    const matched = best <= FACE_THRESHOLD
    const confidence = Math.max(0, Math.min(1, 1 - best / FACE_THRESHOLD))
    return { success: true, data: { matched, confidence } }
  },

  async clearFace(): Promise<IrisResponse<void>> {
    await writeDescriptors([])
    return { success: true }
  },

  async setPin(_: unknown, pin: string): Promise<IrisResponse<void>> {
    if (typeof pin !== 'string' || pin.length < 4) {
      return { success: false, error: 'pin_too_short' }
    }
    const hash = await bcrypt.hash(pin, 12)
    await writePinHash(hash)
    return { success: true }
  },

  async verifyPin(_: unknown, pin: string): Promise<IrisResponse<boolean>> {
    const hash = await readPinHash()
    if (!hash) return { success: true, data: false }
    const ok = await bcrypt.compare(pin, hash)
    return { success: true, data: ok }
  },

  async isSetup(): Promise<IrisResponse<boolean>> {
    const [descriptors, pinHash] = await Promise.all([readDescriptors(), readPinHash()])
    const touchAvailable = process.platform === 'darwin' && systemPreferences.canPromptTouchID()
    return { success: true, data: descriptors.length > 0 || pinHash !== null || touchAvailable }
  },

  async getAvailableMethods(): Promise<IrisResponse<AuthMethods>> {
    const [descriptors, pinHash] = await Promise.all([readDescriptors(), readPinHash()])
    const touchId = process.platform === 'darwin' && systemPreferences.canPromptTouchID()
    return {
      success: true,
      data: {
        touchId,
        face: descriptors.length > 0,
        pin: pinHash !== null,
      },
    }
  },
}
