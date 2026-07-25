declare global {
  interface Window {
    __PIPELINE_DASHBOARD_TOKEN__?: string
  }
}

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return window.__PIPELINE_DASHBOARD_TOKEN__ ?? ''
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function wrapNetwork(error: unknown): never {
  throw new ApiError(`网络错误：${error instanceof Error ? error.message : String(error)}`)
}

export async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

export async function throwApiError(response: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = await readJson(response)
    if (isRecord(body) && typeof body.error === 'string') detail = body.error
  } catch {
    // A response without a JSON envelope falls back to the endpoint-specific message.
  }
  throw new ApiError(detail || `${fallback}（${response.status}）`, response.status)
}

export async function throwDetailedApiError(response: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = await readJson(response)
    if (isRecord(body)) {
      if (stringArray(body.detail) && body.detail.length > 1) detail = body.detail.join('；')
      else if (typeof body.error === 'string') detail = body.error
    }
  } catch {
    // A response without a JSON envelope falls back to the endpoint-specific message.
  }
  throw new ApiError(detail || `${fallback}（${response.status}）`, response.status)
}

export async function throwListApiError(response: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = await readJson(response)
    if (isRecord(body)) {
      if (stringArray(body.errors) && body.errors.length > 0) detail = body.errors.join('；')
      else if (typeof body.error === 'string') detail = body.error
    }
  } catch {
    // A response without a JSON envelope falls back to the endpoint-specific message.
  }
  throw new ApiError(detail || `${fallback}（${response.status}）`, response.status)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

export function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function recordOfStrings(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

export function recordOfBooleans(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'boolean')
}
