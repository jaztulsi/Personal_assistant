import { execSync } from 'child_process'
import type { IrisResponse } from '../../../shared/types'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function bezier5(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  p4: number
): number {
  const u = 1 - t
  return (
    u ** 4 * p0 +
    4 * u ** 3 * t * p1 +
    6 * u ** 2 * t ** 2 * p2 +
    4 * u * t ** 3 * p3 +
    t ** 4 * p4
  )
}

function checkAccessibility(): boolean {
  try {
    execSync('osascript -e \'tell application "System Events" to keystroke ""\'', { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

async function getNut() {
  const { mouse, keyboard, Key, Button, Point } = await import('@nut-tree-fork/nut-js' as any)
  return { mouse, keyboard, Key, Button, Point }
}

function accessibilityError(): IrisResponse<void> {
  return { success: false, error: 'accessibility_required' }
}

export const inputHandlers = {
  async typeText(
    _: unknown,
    text: string,
    options: { ghost?: boolean } = {}
  ): Promise<IrisResponse<void>> {
    if (!checkAccessibility()) return accessibilityError()
    const { keyboard } = await getNut()
    const { ghost = true } = options

    if (!ghost) {
      await keyboard.type(text)
    } else {
      for (const char of text) {
        await keyboard.type(char)
        await sleep(randomBetween(30, 80))
      }
    }
    return { success: true }
  },

  async moveMouse(
    _: unknown,
    targetX: number,
    targetY: number,
    options: { duration?: number } = {}
  ): Promise<IrisResponse<void>> {
    if (!checkAccessibility()) return accessibilityError()
    const { mouse, Point } = await getNut()
    const { duration = 500 } = options
    const steps = Math.max(10, Math.floor(duration / 16))

    const start = await mouse.getPosition()
    const x0 = start.x
    const y0 = start.y

    const ctrl = Array.from({ length: 3 }, () => ({
      x: x0 + Math.random() * (targetX - x0),
      y: y0 + Math.random() * (targetY - y0),
    }))

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const bx = bezier5(t, x0, ctrl[0]!.x, ctrl[1]!.x, ctrl[2]!.x, targetX)
      const by = bezier5(t, y0, ctrl[0]!.y, ctrl[1]!.y, ctrl[2]!.y, targetY)
      await mouse.setPosition(new Point(Math.round(bx), Math.round(by)))
      await sleep(duration / steps)
    }
    return { success: true }
  },

  async click(
    _: unknown,
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<IrisResponse<void>> {
    if (!checkAccessibility()) return accessibilityError()
    const { mouse, Point, Button } = await getNut()
    await mouse.setPosition(new Point(x, y))
    const btn = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT
    await mouse.click(btn)
    return { success: true }
  },

  async shortcut(_: unknown, keys: string[]): Promise<IrisResponse<void>> {
    if (!checkAccessibility()) return accessibilityError()
    const { keyboard, Key } = await getNut()
    const mapped = keys.map((k) => {
      const keyMap: Record<string, unknown> = {
        cmd: Key.LeftSuper, command: Key.LeftSuper, meta: Key.LeftSuper,
        shift: Key.LeftShift, alt: Key.LeftAlt, option: Key.LeftAlt,
        ctrl: Key.LeftControl, control: Key.LeftControl,
      }
      return keyMap[k.toLowerCase()] ?? Key[k.toUpperCase() as keyof typeof Key] ?? k
    })
    await keyboard.pressKey(...(mapped as Parameters<typeof keyboard.pressKey>))
    await keyboard.releaseKey(...(mapped as Parameters<typeof keyboard.releaseKey>))
    return { success: true }
  },

  async scroll(
    _: unknown,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<IrisResponse<void>> {
    if (!checkAccessibility()) return accessibilityError()
    const { mouse, Point } = await getNut()
    await mouse.setPosition(new Point(x, y))
    if (deltaY > 0) await mouse.scrollDown(Math.abs(deltaY))
    if (deltaY < 0) await mouse.scrollUp(Math.abs(deltaY))
    if (deltaX > 0) await mouse.scrollRight(Math.abs(deltaX))
    if (deltaX < 0) await mouse.scrollLeft(Math.abs(deltaX))
    return { success: true }
  },
}
