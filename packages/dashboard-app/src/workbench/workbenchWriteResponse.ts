function isExactSuccessEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const body = value as Record<string, unknown>
  return body.ok === true && Object.keys(body).length === 1
}

export async function readWorkflowWriteSuccess(response: Response): Promise<boolean> {
  try {
    return isExactSuccessEnvelope(await response.json())
  } catch {
    return false
  }
}
