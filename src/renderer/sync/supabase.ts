// IRIS Supabase Sync — best-effort cloud mirror. Local state is canonical. // JASRAJ
//
// Design contract:
//   • Local Electron state (electron-store + Zustand) is always the source of truth.
//   • Supabase is a one-way push mirror so the user can roam between machines later.
//   • Every helper here resolves to { ok: false, reason: 'offline' | 'disabled' | ... }
//     instead of throwing, so missing env / no-network never breaks the app.
//   • Sensitive material (face descriptor) is AES-GCM encrypted in the renderer
//     with a key that never leaves the device.
//
// Required env (renderer, prefixed VITE_):
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon key>
//
// Tables (create in your Supabase project; RLS off / authed to your liking):
//   chat_messages    (id text pk, role text, text text, created_at timestamptz)
//   face_descriptor  (id text pk, ciphertext text, iv text, updated_at timestamptz)
//   pin_hash         (id text pk, hash text, updated_at timestamptz)
//   settings         (key text pk, value jsonb, updated_at timestamptz)

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─── Client (lazy, env-gated) ────────────────────────────────────────────────

let _client: SupabaseClient | null = null
let _resolved = false

function getClient(): SupabaseClient | null {
  if (_resolved) return _client
  _resolved = true
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) {
    // No creds → sync is disabled. Local state still works.
    return null
  }
  try {
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 1 } },
    })
  } catch {
    _client = null
  }
  return _client
}

export function isSyncEnabled(): boolean {
  return getClient() !== null
}

// ─── Device identity (one row per install) ───────────────────────────────────

const DEVICE_ID_KEY = 'iris.deviceId'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ─── Encryption (AES-GCM with a locally-stored key) ──────────────────────────

const ENC_KEY_KEY = 'iris.syncKey'

async function getEncKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(ENC_KEY_KEY)
  if (!raw) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    raw = btoa(String.fromCharCode(...bytes))
    localStorage.setItem(ENC_KEY_KEY, raw)
  }
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptJson(value: unknown): Promise<{ ciphertext: string; iv: string }> {
  const key = await getEncKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const b64 = (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer)))
  return { ciphertext: b64(cipher), iv: b64(iv) }
}

// ─── Helper result ───────────────────────────────────────────────────────────

export type SyncResult = { ok: true } | { ok: false; reason: string }

const DISABLED: SyncResult = { ok: false, reason: 'disabled' }

async function safeUpsert(table: string, row: Record<string, unknown>): Promise<SyncResult> {
  const client = getClient()
  if (!client) return DISABLED
  try {
    const { error } = await client.from(table).upsert(row)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Public push helpers ─────────────────────────────────────────────────────

export async function pushChatTurn(role: 'user' | 'assistant', text: string): Promise<SyncResult> {
  if (!text.trim()) return { ok: false, reason: 'empty' }
  return safeUpsert('chat_messages', {
    id: crypto.randomUUID(),
    device_id: getDeviceId(),
    role,
    text,
    created_at: new Date().toISOString(),
  })
}

export async function pushFaceDescriptor(descriptor: number[]): Promise<SyncResult> {
  const client = getClient()
  if (!client) return DISABLED
  try {
    const { ciphertext, iv } = await encryptJson(descriptor)
    return safeUpsert('face_descriptor', {
      id: getDeviceId(),
      ciphertext,
      iv,
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export async function pushPinHash(hash: string): Promise<SyncResult> {
  // The bcrypt hash is already a one-way digest, so we send it as-is.
  return safeUpsert('pin_hash', {
    id: getDeviceId(),
    hash,
    updated_at: new Date().toISOString(),
  })
}

export async function pushSetting(key: string, value: unknown): Promise<SyncResult> {
  return safeUpsert('settings', {
    key: `${getDeviceId()}:${key}`,
    value,
    updated_at: new Date().toISOString(),
  })
}
