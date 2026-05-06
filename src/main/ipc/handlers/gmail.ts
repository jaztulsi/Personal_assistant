import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import type { IrisResponse, GmailMessage, GmailLabel } from '../../../shared/types'

const TOKEN_PATH = () => path.join(app.getPath('userData'), 'gmail-token.json')

const MOCK_MESSAGES: GmailMessage[] = [
  {
    id: 'mock-msg-001',
    threadId: 'mock-thread-001',
    subject: 'Welcome to IRIS',
    from: 'noreply@iris.local',
    to: 'user@example.com',
    snippet: 'Your IRIS system is now active. Gmail integration requires OAuth setup.',
    date: new Date().toISOString(),
    isRead: false,
    labels: ['INBOX', 'UNREAD'],
  },
  {
    id: 'mock-msg-002',
    threadId: 'mock-thread-002',
    subject: 'IRIS Daily Digest',
    from: 'iris@local',
    to: 'user@example.com',
    snippet: 'Configure your Gmail API credentials to see real messages.',
    date: new Date(Date.now() - 86400000).toISOString(),
    isRead: true,
    labels: ['INBOX'],
  },
]

const MOCK_LABELS: GmailLabel[] = [
  { id: 'INBOX',     name: 'Inbox',     type: 'system', messageCount: 2 },
  { id: 'SENT',      name: 'Sent',      type: 'system', messageCount: 0 },
  { id: 'UNREAD',    name: 'Unread',    type: 'system', messageCount: 1 },
  { id: 'IMPORTANT', name: 'Important', type: 'system', messageCount: 0 },
]

async function getOAuth2Client() {
  const { google } = await import('googleapis')
  const clientId = process.env['GMAIL_CLIENT_ID']
  const clientSecret = process.env['GMAIL_CLIENT_SECRET']
  const redirectUri = process.env['GMAIL_REDIRECT_URI'] ?? 'http://localhost:8080/oauth2callback'

  if (!clientId || !clientSecret) return null

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  try {
    const tokenData = await fs.readFile(TOKEN_PATH(), 'utf-8')
    oauth2Client.setCredentials(JSON.parse(tokenData))
  } catch {
    return null
  }
  return oauth2Client
}

export const gmailHandlers = {
  async auth(): Promise<IrisResponse<{ authenticated: boolean; email?: string }>> {
    const clientId = process.env['GMAIL_CLIENT_ID']
    if (!clientId) {
      return { success: true, data: { authenticated: false }, mocked: true }
    }

    const auth = await getOAuth2Client()
    if (!auth) {
      const { google } = await import('googleapis')
      const oauth2 = new google.auth.OAuth2(
        clientId,
        process.env['GMAIL_CLIENT_SECRET'],
        process.env['GMAIL_REDIRECT_URI'] ?? 'http://localhost:8080/oauth2callback'
      )
      const url = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.modify'],
      })
      // Open auth URL in system browser
      const { shell } = await import('electron')
      shell.openExternal(url)
      return { success: true, data: { authenticated: false } }
    }

    try {
      const { google } = await import('googleapis')
      const gmail = google.gmail({ version: 'v1', auth })
      const profile = await gmail.users.getProfile({ userId: 'me' })
      return { success: true, data: { authenticated: true, email: profile.data.emailAddress ?? undefined } }
    } catch {
      return { success: true, data: { authenticated: false } }
    }
  },

  async listMessages(
    _: unknown,
    options: { maxResults?: number; query?: string; labelId?: string } = {}
  ): Promise<IrisResponse<GmailMessage[]>> {
    const auth = await getOAuth2Client()
    if (!auth) return { success: true, data: MOCK_MESSAGES, mocked: true }

    const { google } = await import('googleapis')
    const gmail = google.gmail({ version: 'v1', auth })
    const { maxResults = 20, query, labelId } = options

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
      labelIds: labelId ? [labelId] : undefined,
    })

    const messages: GmailMessage[] = []
    for (const ref of listRes.data.messages ?? []) {
      if (!ref.id) continue
      const msg = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'] })
      const headers = msg.data.payload?.headers ?? []
      const h = (name: string) => headers.find((hh) => hh.name === name)?.value ?? ''
      messages.push({
        id: ref.id,
        threadId: msg.data.threadId ?? '',
        subject: h('Subject'),
        from: h('From'),
        to: h('To'),
        snippet: msg.data.snippet ?? '',
        date: h('Date'),
        isRead: !(msg.data.labelIds ?? []).includes('UNREAD'),
        labels: msg.data.labelIds ?? [],
      })
    }
    return { success: true, data: messages }
  },

  async sendMessage(
    _: unknown,
    to: string,
    subject: string,
    body: string
  ): Promise<IrisResponse<{ messageId: string }>> {
    const auth = await getOAuth2Client()
    if (!auth) return { success: true, data: { messageId: 'mock-sent-001' }, mocked: true }

    const { google } = await import('googleapis')
    const gmail = google.gmail({ version: 'v1', auth })

    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64url')

    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return { success: true, data: { messageId: res.data.id ?? '' } }
  },

  async getLabels(): Promise<IrisResponse<GmailLabel[]>> {
    const auth = await getOAuth2Client()
    if (!auth) return { success: true, data: MOCK_LABELS, mocked: true }

    const { google } = await import('googleapis')
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.labels.list({ userId: 'me' })
    const labels: GmailLabel[] = (res.data.labels ?? []).map((l) => ({
      id: l.id ?? '',
      name: l.name ?? '',
      type: (l.type === 'user' ? 'user' : 'system') as GmailLabel['type'],
    }))
    return { success: true, data: labels }
  },
}
