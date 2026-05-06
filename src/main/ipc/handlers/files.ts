import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { execSync } from 'child_process'
import { shell } from 'electron'
import type { IrisResponse, FileEntry } from '../../../shared/types'

const MACOS_JUNK = ['.DS_Store', '._', '.Spotlight-V100', '.TemporaryItems', '.Trashes']

async function stat(filePath: string): Promise<FileEntry> {
  const s = await fs.stat(filePath)
  return {
    name: path.basename(filePath),
    path: filePath,
    size: s.size,
    isDirectory: s.isDirectory(),
    modified: s.mtime.toISOString(),
    created: s.birthtime.toISOString(),
  }
}

function isMacOSJunk(name: string): boolean {
  return MACOS_JUNK.some(junk => name === junk || name.startsWith(junk))
}

export const filesHandlers = {
  async read(_: unknown, filePath: string): Promise<IrisResponse<string>> {
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, data: content }
  },

  async write(_: unknown, filePath: string, content: string): Promise<IrisResponse<void>> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  },

  async copy(_: unknown, src: string, dest: string): Promise<IrisResponse<void>> {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(src, dest)
    return { success: true }
  },

  async move(_: unknown, src: string, dest: string): Promise<IrisResponse<void>> {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.rename(src, dest)
    return { success: true }
  },

  async delete(_: unknown, filePath: string): Promise<IrisResponse<void>> {
    await fs.rm(filePath, { recursive: true, force: true })
    return { success: true }
  },

  async list(_: unknown, dir: string): Promise<IrisResponse<FileEntry[]>> {
    const entries = await fs.readdir(dir)
    const filtered = entries.filter(name => !isMacOSJunk(name))
    const results = await Promise.all(
      filtered.map((name) => stat(path.join(dir, name)))
    )
    return { success: true, data: results }
  },

  async search(
    _: unknown,
    dir: string,
    query: string,
    options: { ext?: string; recursive?: boolean } = {}
  ): Promise<IrisResponse<FileEntry[]>> {
    const { ext, recursive = true } = options
    const results: FileEntry[] = []

    async function walk(current: string) {
      if (!existsSync(current)) return
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        if (isMacOSJunk(entry.name)) continue
        const full = path.join(current, entry.name)
        if (entry.isDirectory() && recursive) {
          await walk(full)
        } else {
          const matchesQuery = entry.name.toLowerCase().includes(query.toLowerCase())
          const matchesExt = !ext || entry.name.endsWith(ext)
          if (matchesQuery && matchesExt) {
            results.push(await stat(full))
          }
        }
      }
    }

    await walk(dir)
    return { success: true, data: results }
  },

  async trash(_: unknown, filePath: string): Promise<IrisResponse<void>> {
    try {
      await shell.trashItem(filePath)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  },
}
