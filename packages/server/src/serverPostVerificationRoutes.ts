import type { IncomingMessage, ServerResponse } from 'node:http'
import { composeVerificationEvidence } from '@tenon/kernel'
import { assertWorkflowRootAnchor } from './workflows.js'
import type { PostRouteDeps } from './serverPostRoutes.js'

const ROUTE = '/api/verification-evidence/compose'

export async function handlePostVerificationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: PostRouteDeps,
): Promise<void> {
  if (path !== ROUTE) return
  const raw = await deps.readJsonBody(req)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return deps.sendJson(res, 400, {
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'Verification evidence request must be a JSON object',
      details: [{ code: 'object_invalid', path: '' }],
      overflow: false,
    })
  }
  const body = raw as Record<string, unknown>
  if (typeof body.root !== 'string' || body.root.trim() === '') {
    return deps.sendJson(res, 400, {
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'Verification evidence root must be a non-empty string',
      details: [{
        code: typeof body.root === 'string' || body.root === undefined
          ? 'field_required'
          : 'field_type',
        path: 'root',
      }],
      overflow: false,
    })
  }
  const root = body.root
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return deps.sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
  }

  try {
    assertWorkflowRootAnchor(rootCheck.anchor)
  } catch (error) {
    return deps.sendJson(res, 403, { ok: false, error: deps.errMsg(error) })
  }
  const composerInput = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'root') composerInput[key] = value
  }
  const result = composeVerificationEvidence(composerInput)
  try {
    assertWorkflowRootAnchor(rootCheck.anchor)
  } catch (error) {
    return deps.sendJson(res, 403, { ok: false, error: deps.errMsg(error) })
  }
  if (!result.ok) {
    return deps.sendJson(res, 400, {
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'Verification evidence is invalid',
      details: result.errors,
      overflow: result.overflow,
    })
  }
  return deps.sendJson(res, 200, result)
}
