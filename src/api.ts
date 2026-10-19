export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Une erreur est survenue.')
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T = unknown>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T = unknown>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T = unknown>(url: string) => request<T>('DELETE', url),
  async upload(itemId: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/admin/items/${itemId}/images`, { method: 'POST', body: fd })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      throw new ApiError(res.status, d.error ?? 'Envoi de l’image impossible.')
    }
  },
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Une erreur est survenue.')
