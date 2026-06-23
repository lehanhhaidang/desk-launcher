export interface ProviderInfo {
  id: string
  name: string
  defaultBasePath: string | null
  sessionFormat: string
}

export interface ProjectEntry {
  name: string
  path: string
  sessionCount: number
  /** Unix seconds. */
  lastModified: number
}

export interface SessionEntry {
  id: string
  path: string
  sizeBytes: number
  /** Unix seconds. */
  lastModified: number
  /** Best-effort human title (summary or first user line). */
  title: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** ISO 8601 string, if the log recorded one. */
  timestamp: string | null
}
