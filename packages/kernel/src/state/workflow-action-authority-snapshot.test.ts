import { describe, expect, it } from 'vitest'
import {
  createWorkflowActionAuthoritySnapshot,
  parseWorkflowActionAuthoritySnapshot,
  workflowActionAuthoritySnapshotContent,
} from './workflow-action-authority-snapshot.js'

const WORKFLOW_FINGERPRINT = 'a'.repeat(64)
const input = () => ({
  action: 'enter-afk' as const,
  workflowRunId: 'run-1', workflowId: 'afk-workflow', workflowFingerprint: WORKFLOW_FINGERPRINT,
  loopId: 'loop-a', iterationId: 'iteration-attempt-1', attemptId: 'attempt-1',
  reservationId: 'reservation-1', skillBundleId: '_all', trackId: 'backend',
  trackRegistryRevision: '0123456789abcdef',
  layers: {
    platform: { status: 'valid' as const, grants: ['write-filesystem', 'enter-afk'] as const },
    skill: { status: 'valid' as const, grants: ['enter-afk'] as const },
    project: { status: 'valid' as const, grants: ['enter-afk'] as const },
    workflow: { status: 'valid' as const, grants: ['enter-afk'] as const },
    run: { status: 'valid' as const, grants: ['enter-afk'] as const },
  },
  provenance: {
    platform: { kind: 'platform-policy' as const, identity: 'tenon-afk', revision: 'v1' },
    skill: { kind: 'skill-contract' as const, identity: '_all', revision: WORKFLOW_FINGERPRINT },
    project: { kind: 'track-registry' as const, identity: 'backend', revision: '0123456789abcdef' },
    workflow: { kind: 'workflow-plan' as const, identity: 'afk-workflow', revision: WORKFLOW_FINGERPRINT },
    run: { kind: 'workflow-run' as const, identity: 'run-1', revision: 'iteration-attempt-1' },
  },
})

describe('WorkflowActionAuthoritySnapshot v1 codec', () => {
  it('normalizes all five layers and round-trips the closed immutable snapshot', () => {
    const snapshot = createWorkflowActionAuthoritySnapshot(input())
    expect(snapshot.layers.map((layer) => layer.layer)).toEqual([
      'platform', 'skill', 'project', 'workflow', 'run',
    ])
    expect(snapshot.layers[0]?.grants).toEqual(['enter-afk', 'write-filesystem'])
    expect(parseWorkflowActionAuthoritySnapshot(workflowActionAuthoritySnapshotContent(snapshot)))
      .toEqual(snapshot)
  })

  it('rejects unknown keys and fingerprint tampering', () => {
    const snapshot = createWorkflowActionAuthoritySnapshot(input())
    expect(() => parseWorkflowActionAuthoritySnapshot(JSON.stringify({ ...snapshot, surprise: true })))
      .toThrow(/shape|unknown|形状/i)
    expect(() => parseWorkflowActionAuthoritySnapshot(JSON.stringify({
      ...snapshot, reservation_id: 'reservation-forged',
    }))).toThrow(/fingerprint|digest/i)
  })
})
