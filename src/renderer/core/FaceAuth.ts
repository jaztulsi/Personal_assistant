import * as faceapi from 'face-api.js'

// IRIS Face Authentication — local biometric, no cloud // JASRAJ

const MATCH_THRESHOLD = 0.55
const MODEL_URL_BASE = 'models'

let modelsLoaded = false
let faceAuthAvailable = true

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i]! - b[i]!) ** 2
  }
  return Math.sqrt(sum)
}

async function ensureModels(): Promise<boolean> {
  if (modelsLoaded) return true
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL_BASE)
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL_BASE)
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL_BASE)
    modelsLoaded = true
    return true
  } catch {
    faceAuthAvailable = false
    return false
  }
}

export class FaceAuth {
  private videoEl: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private storedDescriptor: Float32Array | null = null

  async init(): Promise<boolean> {
    const permResult = await window.iris.macos.requestPermission('camera')
    if (!permResult.data?.granted) {
      faceAuthAvailable = false
      return false
    }
    return ensureModels()
  }

  isAvailable(): boolean {
    return faceAuthAvailable
  }

  async loadStoredFace(): Promise<boolean> {
    const result = await window.iris.auth.getFace()
    if (result.success && result.data) {
      this.storedDescriptor = new Float32Array(result.data)
      return true
    }
    return false
  }

  async hasEnrolledFace(): Promise<boolean> {
    const result = await window.iris.auth.hasFace()
    return result.data === true
  }

  async startCamera(videoElement: HTMLVideoElement): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      })
      videoElement.srcObject = this.stream
      await videoElement.play()
      this.videoEl = videoElement
      return true
    } catch {
      faceAuthAvailable = false
      return false
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null
      this.videoEl = null
    }
  }

  async detectAndDescribe(): Promise<Float32Array | null> {
    if (!this.videoEl || !modelsLoaded) return null

    const detection = await faceapi
      .detectSingleFace(this.videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()

    return detection?.descriptor ?? null
  }

  async enroll(): Promise<boolean> {
    const descriptor = await this.detectAndDescribe()
    if (!descriptor) return false

    await window.iris.auth.storeFace(Array.from(descriptor))
    this.storedDescriptor = descriptor
    return true
  }

  async verify(): Promise<{ matched: boolean; distance: number }> {
    if (!this.storedDescriptor) {
      const loaded = await this.loadStoredFace()
      if (!loaded) return { matched: false, distance: 1 }
    }

    const liveDescriptor = await this.detectAndDescribe()
    if (!liveDescriptor || !this.storedDescriptor) {
      return { matched: false, distance: 1 }
    }

    const distance = euclideanDistance(liveDescriptor, this.storedDescriptor)
    return { matched: distance < MATCH_THRESHOLD, distance }
  }

  async clearEnrollment(): Promise<void> {
    await window.iris.auth.clearFace()
    this.storedDescriptor = null
  }
}

export const faceAuth = new FaceAuth()
