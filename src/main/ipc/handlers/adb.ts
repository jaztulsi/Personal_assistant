import type { IrisResponse, AdbDevice } from '../../../shared/types'

// Mock data — returned when ADB is unavailable or no real device is connected
const MOCK_DEVICES: AdbDevice[] = [
  {
    id: 'emulator-5554',
    type: 'emulator',
    model: 'Pixel 7',
    androidVersion: '14',
  },
]

async function getClient() {
  const adb = await import('@devicefarmer/adbkit')
  return adb.default.createClient()
}

export const adbHandlers = {
  async connect(_: unknown, host: string, port = 5555): Promise<IrisResponse<{ id: string }>> {
    try {
      const client = await getClient()
      const id = `${host}:${port}`
      await client.connect(host, port)
      return { success: true, data: { id } }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<{ id: string }>
    }
  },

  async listDevices(): Promise<IrisResponse<AdbDevice[]>> {
    try {
      const client = await getClient()
      const rawDevices = await client.listDevices()
      if (!rawDevices.length) {
        return { success: true, data: MOCK_DEVICES, mocked: true }
      }
      const devices: AdbDevice[] = rawDevices.map((d) => ({
        id: d.id,
        type: d.type as AdbDevice['type'],
      }))
      return { success: true, data: devices }
    } catch {
      return { success: true, data: MOCK_DEVICES, mocked: true }
    }
  },

  async tap(_: unknown, deviceId: string, x: number, y: number): Promise<IrisResponse<void>> {
    try {
      const client = await getClient()
      await client.shell(deviceId, `input tap ${x} ${y}`)
      return { success: true }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<void>
    }
  },

  async swipe(
    _: unknown,
    deviceId: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration = 300
  ): Promise<IrisResponse<void>> {
    try {
      const client = await getClient()
      await client.shell(deviceId, `input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`)
      return { success: true }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<void>
    }
  },

  async push(
    _: unknown,
    deviceId: string,
    localPath: string,
    remotePath: string
  ): Promise<IrisResponse<void>> {
    try {
      const client = await getClient()
      const transfer = await client.push(deviceId, localPath, remotePath)
      await new Promise<void>((resolve, reject) => {
        transfer.on('end', resolve)
        transfer.on('error', reject)
      })
      return { success: true }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<void>
    }
  },

  async pull(
    _: unknown,
    deviceId: string,
    remotePath: string,
    localPath: string
  ): Promise<IrisResponse<void>> {
    try {
      const client = await getClient()
      const transfer = await client.pull(deviceId, remotePath)
      const { createWriteStream } = await import('fs')
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(localPath)
        transfer.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        transfer.on('error', reject)
      })
      return { success: true }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<void>
    }
  },

  async shell(_: unknown, deviceId: string, command: string): Promise<IrisResponse<string>> {
    try {
      const client = await getClient()
      const output = await client.shell(deviceId, command)
      const { default: adb } = await import('@devicefarmer/adbkit')
      const text = await adb.util.readAll(output)
      return { success: true, data: text.toString().trim() }
    } catch (err) {
      return { success: false, reconnect: true, error: String(err) } as IrisResponse<string>
    }
  },
}
