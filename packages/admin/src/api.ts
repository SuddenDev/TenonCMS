import { ref } from 'vue'

export type Field = {
  type: string
  label?: string
  required?: boolean
  options?: string[]
}
export type Fields = Record<string, Field>
export type Schema = {
  collections?: Record<string, { label?: string; titleField?: string; fields: Fields }>
  globals?: Record<string, { label?: string; fields: Fields }>
}
export type Doc = Record<string, unknown> & { id: string }

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(body?.message ?? body?.error?.[0]?.message ?? `Request failed (${status})`)
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/cms${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export const schema = ref<Schema>({})
