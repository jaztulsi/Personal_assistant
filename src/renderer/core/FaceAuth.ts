// IRIS FaceAuth — face-api.js, ssd_mobilenetv1, 128-dim descriptors // JASRAJ
//
// All biometric data is local. Descriptors live in electron-store under
// 'faceDescriptors' (via main IPC). Nothing leaves the device.
// Match metric: Euclidean distance, threshold 0.5 (must agree with main-side).

type FaceApi = typeof import('face-api.js')

const MODEL_URL = '/models' // public/models/* (served by Vite during dev, packaged for prod)
const MATCH_THRESHOLD = 0.5

export interface FaceAuthState {
  available: boolean
  enrolled: boolean
  reason?: string
}

class FaceAuthEngine {
  private faceapi: FaceApi | null = null
  private modelsLoaded = false
  private loadPromise: Promise<boolean> | null = null

  faceAuthAvailable = false
  enrolledCount = 0

  /** Lazy-loads face-api + the SSD MobileNet weights. Returns true if usable. */
  async load(): Promise<boolean> {
    if (this.modelsLoaded) return true
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = (async () => {
      try {
        const mod = (await import('face-api.js')) as FaceApi
        this.faceapi = mod
        await Promise.all([
          mod.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          mod.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          mod.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        this.modelsLoaded = true
        this.faceAuthAvailable = true
        return true
      } catch {
        this.faceAuthAvailable = false
        this.modelsLoaded = false
        return false
      }
    })()
    return this.loadPromise
  }

  /** Compute a 128-dim descriptor from a video element. Returns null on failure. */
  async computeDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
    if (!this.faceapi || !this.modelsLoaded) {
      const ok = await this.load()
      if (!ok) return null
    }
    const fa = this.faceapi!
    try {
      const detection = await fa
        .detectSingleFace(video, new fa.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
      if (!detection) return null
      return Array.from(detection.descriptor)
    } catch {
      return null
    }
  }

  /** Open the user's camera at 320×240. Caller must stop the returned stream. */
  async openCamera(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
    } catch {
      this.faceAuthAvailable = false
      return null
    }
  }

  /** Sample a single face from the camera feed and enroll it. */
  async enroll(
    video: HTMLVideoElement,
  ): Promise<{ ok: boolean; count?: number; error?: string; descriptor?: number[] }> {
    const desc = await this.computeDescriptor(video)
    if (!desc) return { ok: false, error: 'no_face' }
    const r = await window.iris.auth.enrollFace(desc)
    if (!r.success) return { ok: false, error: r.error ?? 'enroll_failed' }
    this.enrolledCount = r.data?.count ?? this.enrolledCount + 1
    return { ok: true, count: this.enrolledCount, descriptor: desc }
  }

  /** Sample a single face and verify against stored descriptors. */
  async verify(video: HTMLVideoElement): Promise<{ matched: boolean; confidence: number }> {
    const desc = await this.computeDescriptor(video)
    if (!desc) return { matched: false, confidence: 0 }
    const r = await window.iris.auth.verifyFace(desc)
    if (!r.success || !r.data) return { matched: false, confidence: 0 }
    return r.data
  }

  /** Refresh enrollment count from the store. */
  async refreshState(): Promise<FaceAuthState> {
    try {
      const methods = await window.iris.auth.getAvailableMethods()
      const enrolled = methods.success && methods.data ? methods.data.face : false
      return {
        available: this.faceAuthAvailable,
        enrolled,
      }
    } catch (err) {
      return {
        available: false,
        enrolled: false,
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  }

  get threshold(): number { return MATCH_THRESHOLD }
}

export const faceAuth = new FaceAuthEngine()
