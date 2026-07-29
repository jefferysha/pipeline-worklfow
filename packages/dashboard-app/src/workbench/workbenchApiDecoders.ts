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

export async function readSaveErrors(
  response: Response,
  unauthorizedMessage: string,
  localizedFallback: string,
  exposeServerDetail: boolean,
): Promise<string[]> {
  if (response.status === 401) return [unauthorizedMessage]
  try {
    const body: unknown = await response.json()
    if (!exposeServerDetail) return [localizedFallback]
    const errors = field(body, 'errors')
    if (Array.isArray(errors)) {
      const strings = errors.filter((error): error is string => typeof error === 'string')
      if (strings.length > 0) return strings
    }
    const error = field(body, 'error')
    if (typeof error === 'string') return [error]
  } catch { /* use the localized status fallback */ }
  return [localizedFallback]
}
