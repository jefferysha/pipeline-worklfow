import { readCurrentRunRevision } from './run-revision-store.js'
import { DocumentLedgerError } from './document-path.js'

/** Stable authored-step visit identity; legacy YAML-only Changes fail closed until canonicalized. */
export async function currentDocumentStepVisitId(changeDir: string): Promise<string> {
  const metadata = (await readCurrentRunRevision(changeDir))?.state.runMetadata
  if (metadata === undefined) throw new DocumentLedgerError(
    '缺少 canonical WorkflowRun visit identity；旧 Change 必须先通过受控 state mutation 建立 run identity，再重新读取 document',
  )
  return JSON.stringify([metadata.runId, metadata.transitionSequence])
}
