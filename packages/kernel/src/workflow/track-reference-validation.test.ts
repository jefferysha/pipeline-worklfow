import { describe, expect, it } from 'vitest'
import type { TrackRegistry } from '../tracks/types.js'
import { validateWorkflowTrackReferences } from './track-reference-validation.js'
import type { WorkflowDef } from './types.js'

function registry(ids: readonly string[]): TrackRegistry {
  const ordered = ids.map((id) => ({
    id,
    label: id,
    builtin: false,
    workflow: { default: 'default', allowed: '*' as const },
    policyProfile: {
      reviewSeed: 'pending' as const,
      automationEligible: true,
      coverageProfile: 'none' as const,
      routing: { enabled: false as const },
      skills: { matrix: true, profile: '_all' as const },
    },
  }))
  return { ordered, byId: new Map(ordered.map((track) => [track.id, track])), revision: 'test', source: 'project-file' }
}

function workflow(): WorkflowDef {
  return {
    name: 'custom',
    steps: [
      {
        id: 'build', label: 'Build', gate: null, skills: [], inputs: [],
        outputs: [{ field: 'plan', type: 'file_path' }],
        artifacts: [{
          field: 'plan', type: 'file_path', producerPolicy: 'effective-step-skills',
          requiredWhen: { kind: 'track-in', values: ['frontend', 'mobile'] },
        }],
        guards: [{ type: 'full-direct-override', when: { kind: 'track-not-in', values: ['pm'] } }],
        transitions: [{
          event: 'done', to: 'archive',
          guards: [{ type: 'field-nonempty', field: 'plan', when: { kind: 'track-in', values: ['backend'] } }],
          actions: [],
        }],
      },
      { id: 'archive', label: 'Archive', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
    ],
  }
}

describe('validateWorkflowTrackReferences', () => {
  it('step guard、edge guard、artifact required_when 的引用全部存在 → []', () => {
    expect(validateWorkflowTrackReferences(workflow(), registry(['frontend', 'mobile', 'pm', 'backend']))).toEqual([])
  })

  it('收集所有未知 track，保留可定位路径；track-not-in 也必须引用真实 track', () => {
    const errors = validateWorkflowTrackReferences(workflow(), registry(['frontend']))
    expect(errors).toEqual([
      "workflow.steps[0].guards[0].when.values[0]: 未知 track 'pm'",
      "workflow.steps[0].transitions[0].guards[0].when.values[0]: 未知 track 'backend'",
      "workflow.steps[0].artifacts[0].requiredWhen.values[1]: 未知 track 'mobile'",
    ])
  })

  it('同一路径重复引用同一未知值仍逐位置报告，避免隐藏坏输入', () => {
    const wf = workflow()
    const first = wf.steps[0]!
    const duplicate: WorkflowDef = {
      ...wf,
      steps: [{ ...first, guards: [{ type: 'full-direct-override', when: { kind: 'track-in', values: ['ghost', 'ghost'] } }] }, wf.steps[1]!],
    }
    expect(validateWorkflowTrackReferences(duplicate, registry([]))).toEqual([
      "workflow.steps[0].guards[0].when.values[0]: 未知 track 'ghost'",
      "workflow.steps[0].guards[0].when.values[1]: 未知 track 'ghost'",
      "workflow.steps[0].transitions[0].guards[0].when.values[0]: 未知 track 'backend'",
      "workflow.steps[0].artifacts[0].requiredWhen.values[0]: 未知 track 'frontend'",
      "workflow.steps[0].artifacts[0].requiredWhen.values[1]: 未知 track 'mobile'",
    ])
  })
})
