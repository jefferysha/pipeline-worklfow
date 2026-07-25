export const STAGE_ID_RE = /^[a-zA-Z0-9_-]+$/

export function slugifyStageName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

export async function readErrorDetail(response: Response): Promise<string> {
  try {
    const error = field(await response.json(), 'error')
    return typeof error === 'string' ? error : ''
  } catch {
    return ''
  }
}

export async function readSaveErrors(response: Response): Promise<string[]> {
  if (response.status === 401) return ['当前页面的保存凭证已失效，请刷新页面后重试。']
  try {
    const body: unknown = await response.json()
    const errors = field(body, 'errors')
    if (Array.isArray(errors)) {
      const strings = errors.filter((error): error is string => typeof error === 'string')
      if (strings.length > 0) return strings
    }
    const error = field(body, 'error')
    if (typeof error === 'string') return [error]
  } catch {
    return [`(${response.status})`]
  }
  return [`(${response.status})`]
}
