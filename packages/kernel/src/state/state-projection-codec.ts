import type { PipelineState } from '../types.js'
import { serializePipeline } from './parse.js'
import {
  rollbackCompatibleState,
  type RunRevision,
} from './run-revision-codec.js'

function metadataFor(revision: RunRevision): NonNullable<PipelineState['projectionMetadata']> {
  return {
    stateRevision: revision.revision,
    stateRevisionId: revision.revisionId,
    stateDigest: revision.stateDigest,
  }
}

/** N-1 writable adapter shape: old field closure plus the exact anchored opaque tail. */
export function projectionContent(revision: RunRevision): string {
  return serializePipeline({
    ...rollbackCompatibleState(revision),
    projectionMetadata: metadataFor(revision),
  }, { omitPreVerifyReview: true })
}

/** Projection shape emitted before the rollback-compatible companion migration. */
export function priorLogicalProjectionContent(revision: RunRevision): string {
  return serializePipeline({
    ...structuredClone(revision.state),
    projectionMetadata: metadataFor(revision),
  })
}
