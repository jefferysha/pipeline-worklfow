import { decodeRelatedSessionSearch } from './memoryDecoders'
import type { RelatedSessionSearchInput, RelatedSessionSearchResponse } from './memoryTypes'
import { ApiError, getToken, readJson, throwApiError, wrapNetwork } from './transport'

export async function searchRelatedSessions(
  input: RelatedSessionSearchInput,
  signal?: AbortSignal,
): Promise<RelatedSessionSearchResponse> {
  let response: Response
  try {
    response = await fetch('/api/mem/related-sessions/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(input),
      signal,
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, '相关会话检索失败')
  const body = decodeRelatedSessionSearch(await readJson(response))
  if (!body) throw new ApiError('相关会话检索响应形状无效', response.status)
  return body
}
