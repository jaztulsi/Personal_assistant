import { desktopCapturer, screen } from 'electron'
import type { IrisResponse, ScreenInfo } from '../../../shared/types'

export const screenHandlers = {
  async capture(_: unknown, displayId?: number): Promise<IrisResponse<string>> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    let source = sources[0]
    if (displayId !== undefined) {
      source = sources.find((s) => s.display_id === String(displayId)) ?? sources[0]
    }

    if (!source) return { success: false, error: 'No screen sources available' }

    const dataURL = source.thumbnail.toDataURL()
    return { success: true, data: dataURL }
  },

  async ocr(_: unknown, imageBase64: string): Promise<IrisResponse<string>> {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const { data: { text } } = await worker.recognize(buffer)
      return { success: true, data: text.trim() }
    } finally {
      await worker.terminate()
    }
  },

  async getInfo(): Promise<IrisResponse<ScreenInfo[]>> {
    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    const infos: ScreenInfo[] = displays.map((d) => ({
      id: d.id,
      label: `Display ${d.id}`,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primary.id,
    }))
    return { success: true, data: infos }
  },
}
