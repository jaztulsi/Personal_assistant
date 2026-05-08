// IRIS ParticleSphere — voice-reactive 3D point cloud // JASRAJ
//
// 2000 particles distributed via the fibonacci sphere algorithm.
// Slow Y-axis rotation (~0.001 rad/frame), audio-reactive scale,
// vertex colors lerp emerald → cyan along low → high frequency bands.
// Lerp smoothing 0.1 keeps the motion buttery on M1 Metal.

import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  /** AnalyserNode.getByteFrequencyData() output (or empty Uint8Array for idle). */
  frequencyData?: Uint8Array | null
  /** True while the user is speaking — increases pulse + brightness. */
  listening?: boolean
}

const PARTICLE_COUNT = 2000
const ROTATION_SPEED = 0.001
const LERP_FACTOR    = 0.1
const SPHERE_RADIUS  = 1.2

const COLOR_LOW    = new THREE.Color('#10b981') // emerald-500
const COLOR_HIGH   = new THREE.Color('#06b6d4') // cyan-500
const COLOR_IDLE   = new THREE.Color('#34d399') // emerald-400 dim

// ── Fibonacci sphere distribution ───────────────────────────────────────────
function buildFibonacciSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const phi = Math.PI * (3 - Math.sqrt(5)) // golden angle
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    positions[i * 3]     = Math.cos(theta) * r * radius
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = Math.sin(theta) * r * radius
  }
  return positions
}

function buildInitialColors(count: number): Float32Array {
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3]     = COLOR_IDLE.r
    colors[i * 3 + 1] = COLOR_IDLE.g
    colors[i * 3 + 2] = COLOR_IDLE.b
  }
  return colors
}

interface PointsProps {
  frequencyData: Uint8Array | null | undefined
  listening: boolean | undefined
}

function Points({ frequencyData, listening }: PointsProps) {
  const ref = useRef<THREE.Points>(null)
  const targetScale = useRef(1)
  const currentScale = useRef(1)

  const basePositions = useMemo(() => buildFibonacciSphere(PARTICLE_COUNT, SPHERE_RADIUS), [])
  const initialColors  = useMemo(() => buildInitialColors(PARTICLE_COUNT), [])

  // Re-usable scratch color (no per-frame alloc).
  const scratch = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const points = ref.current
    if (!points) return

    // ── Average bands 0–15 (low end → loudest in human voice) ─────────────
    let avg = 0
    if (frequencyData && frequencyData.length > 0) {
      const bands = Math.min(16, frequencyData.length)
      let sum = 0
      for (let i = 0; i < bands; i++) sum += frequencyData[i] ?? 0
      avg = sum / (bands * 255) // 0–1
    }

    // Listening adds a baseline pulse so the sphere feels alive even on quiet
    const listenBoost = listening ? 0.2 : 0
    targetScale.current = 1 + Math.min(0.8, avg * 2 + listenBoost)

    // Smooth lerp toward target scale
    currentScale.current += (targetScale.current - currentScale.current) * LERP_FACTOR
    points.scale.setScalar(currentScale.current)

    // Slow rotation
    points.rotation.y += ROTATION_SPEED

    // ── Vertex colors: low freq → emerald, high freq → cyan ────────────────
    const geom = points.geometry as THREE.BufferGeometry
    const colorAttr = geom.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!colorAttr || !frequencyData || frequencyData.length === 0) {
      // Idle drift: keep dim emerald
      if (colorAttr) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          colorAttr.array[i * 3]     = COLOR_IDLE.r
          colorAttr.array[i * 3 + 1] = COLOR_IDLE.g
          colorAttr.array[i * 3 + 2] = COLOR_IDLE.b
        }
        colorAttr.needsUpdate = true
      }
      return
    }

    // Distribute frequency bins across the particle ring.
    const bins = frequencyData.length
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const bin = Math.floor((i / PARTICLE_COUNT) * bins)
      const t   = (frequencyData[bin] ?? 0) / 255
      scratch.copy(COLOR_LOW).lerp(COLOR_HIGH, t)
      // Listening bumps brightness via additive multiply
      const bright = listening ? 1 + t * 0.3 : 0.85 + t * 0.4
      colorAttr.array[i * 3]     = Math.min(1, scratch.r * bright)
      colorAttr.array[i * 3 + 1] = Math.min(1, scratch.g * bright)
      colorAttr.array[i * 3 + 2] = Math.min(1, scratch.b * bright)
    }
    colorAttr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[basePositions, 3]}
          count={PARTICLE_COUNT}
          array={basePositions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[initialColors, 3]}
          count={PARTICLE_COUNT}
          array={initialColors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.018}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export function ParticleSphere({ frequencyData, listening }: Props) {
  return (
    <Canvas
      gl={{ powerPreference: 'high-performance', antialias: true, alpha: true }}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.4} />
      <Points frequencyData={frequencyData} listening={listening} />
    </Canvas>
  )
}

export default ParticleSphere
