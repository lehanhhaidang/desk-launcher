const API_BASE_URL = '__TAURI_INTERNALS__' in window
    ? 'http://127.0.0.1:8000'
    : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

interface RequestOptions {
    method?: string
    body?: unknown
    signal?: AbortSignal
    headers?: Record<string, string>
}

export async function apiRequest<T>(
    endpoint: string,
    options: RequestOptions = {},
): Promise<T> {
    const { method = 'GET', body, signal, headers = {} } = options

    const mergedHeaders: Record<string, string> = {
        ...headers,
    }
    if (body) {
        mergedHeaders['Content-Type'] = 'application/json'
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: mergedHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal,
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(error.detail || `Request failed: ${response.status}`)
    }

    return response.json()
}

export { API_BASE_URL }

export async function apiDownload(
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Download failed' }))
        throw new Error(error.detail || `Download failed: ${response.status}`)
    }

    const disposition = response.headers.get('Content-Disposition') || ''
    const filenameMatch = disposition.match(/filename="?(.+?)"?$/)
    const filename = filenameMatch?.[1] || 'download'

    const blob = await response.blob()
    return { blob, filename }
}
