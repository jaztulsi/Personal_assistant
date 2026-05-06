import path from 'path'
import { app } from 'electron'
import type { IrisResponse, EmbeddingResult, VectorSearchResult } from '../../../shared/types'

// IRIS local AI — arm64 WASM embeddings via @xenova/transformers + vectordb (lancedb fork)

let _pipeline: unknown = null

async function getEmbedder() {
  if (!_pipeline) {
    const { pipeline } = await import('@xenova/transformers')
    _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return _pipeline as (text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>
}

const DB_PATH = () => path.join(app.getPath('userData'), 'iris-vectors')
let _db: unknown = null
let _table: unknown = null

async function getVectorTable() {
  if (!_table) {
    const lancedb = await import('vectordb')
    _db = await (lancedb as any).connect(DB_PATH())
    const tables = await (_db as any).tableNames()
    if (tables.includes('iris_embeddings')) {
      _table = await (_db as any).openTable('iris_embeddings')
    } else {
      _table = await (_db as any).createTable('iris_embeddings', [
        { id: '__init__', text: '', vector: Array(384).fill(0), metadata: '{}' },
      ])
    }
  }
  return _table as any
}

async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder()
  const result = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(result.data)
}

export const aiHandlers = {
  async embed(_: unknown, text: string): Promise<IrisResponse<EmbeddingResult>> {
    const vector = await embedText(text)
    return {
      success: true,
      data: {
        vector,
        model: 'all-MiniLM-L6-v2',
        dimensions: vector.length,
      },
    }
  },

  async vectorSearch(
    _: unknown,
    query: string,
    options: { topK?: number; threshold?: number } = {}
  ): Promise<IrisResponse<VectorSearchResult[]>> {
    const { topK = 5 } = options
    const queryVector = await embedText(query)
    const table = await getVectorTable()

    const results = await table
      .search(queryVector)
      .limit(topK)
      .execute()

    const hits: VectorSearchResult[] = (results as any[])
      .filter((r) => r.id !== '__init__')
      .map((r) => ({
        id: r.id,
        text: r.text,
        score: 1 - (r._distance ?? 0),
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      }))

    return { success: true, data: hits }
  },

  async indexDirectory(
    _: unknown,
    dir: string,
    options: { recursive?: boolean; extensions?: string[] } = {}
  ): Promise<IrisResponse<{ indexed: number }>> {
    const { recursive = true, extensions = ['.txt', '.md', '.ts', '.tsx', '.js', '.py'] } = options
    const fs = await import('fs/promises')
    const table = await getVectorTable()
    let count = 0

    async function walk(current: string) {
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory() && recursive) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(full)
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase()
          if (!extensions.includes(ext)) continue
          try {
            const text = await fs.readFile(full, 'utf-8')
            if (!text.trim()) continue
            const chunks = chunkText(text, 512)
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i]!
              const vector = await embedText(chunk)
              await table.add([{
                id: `${full}::${i}`,
                text: chunk,
                vector,
                metadata: JSON.stringify({ path: full, chunk: i }),
              }])
              count++
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    await walk(dir)
    return { success: true, data: { indexed: count } }
  },
}

function chunkText(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current: string[] = []
  for (const word of words) {
    current.push(word)
    if (current.length >= maxTokens) {
      chunks.push(current.join(' '))
      current = []
    }
  }
  if (current.length) chunks.push(current.join(' '))
  return chunks
}
