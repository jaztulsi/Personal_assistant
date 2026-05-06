import type { IrisResponse, WebSearchResult } from '../../../shared/types'

const MOCK_SEARCH_RESULTS: WebSearchResult[] = [
  {
    title: 'IRIS OS — Intelligent Runtime Interface System',
    url: 'https://example.com/iris-os',
    snippet: 'IRIS is a local-first AI desktop shell built by Jasraj for macOS Apple Silicon.',
    publishedDate: new Date().toISOString(),
  },
  {
    title: 'Apple Silicon M3 Performance Benchmarks 2025',
    url: 'https://example.com/m3-benchmarks',
    snippet: 'The M3 chip delivers exceptional performance for AI workloads including local LLM inference.',
    publishedDate: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    title: 'Electron + Vite + React 19 on macOS arm64',
    url: 'https://example.com/electron-arm64',
    snippet: 'A guide to building native arm64 Electron apps with Vite and React 19 on Apple Silicon.',
    publishedDate: new Date(Date.now() - 172800000).toISOString(),
  },
]

async function getBrowser() {
  const puppeteer = await import('puppeteer-core')
  const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH']
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export const webHandlers = {
  async scrape(_: unknown, url: string, selector?: string): Promise<IrisResponse<string>> {
    const browser = await getBrowser()
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      const html = selector
        ? await page.$eval(selector, (el) => (el as HTMLElement).innerText)
        : await page.content()

      const { load } = await import('cheerio')
      const $ = load(html)
      $('script, style, nav, footer, header').remove()
      const text = $('body').text().replace(/\s+/g, ' ').trim()
      return { success: true, data: text }
    } finally {
      await browser.close()
    }
  },

  async search(
    _: unknown,
    query: string,
    options: { maxResults?: number } = {}
  ): Promise<IrisResponse<WebSearchResult[]>> {
    const apiKey = process.env['TAVILY_API_KEY']
    if (!apiKey) return { success: true, data: MOCK_SEARCH_RESULTS, mocked: true }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: options.maxResults ?? 5,
      }),
    })

    if (!res.ok) return { success: true, data: MOCK_SEARCH_RESULTS, mocked: true }

    const json = await res.json() as { results?: Array<{ title: string; url: string; content: string; published_date?: string }> }
    const results: WebSearchResult[] = (json.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      publishedDate: r.published_date,
    }))
    return { success: true, data: results }
  },

  async fetchPage(
    _: unknown,
    url: string,
    options: { js?: boolean } = {}
  ): Promise<IrisResponse<string>> {
    if (!options.js) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      })
      const html = await res.text()
      const { load } = await import('cheerio')
      const $ = load(html)
      $('script, style').remove()
      return { success: true, data: $('body').text().replace(/\s+/g, ' ').trim() }
    }

    const browser = await getBrowser()
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      const content = await page.content()
      return { success: true, data: content }
    } finally {
      await browser.close()
    }
  },
}
