import { describe, expect, it } from 'vitest'
import {
  canonicalWorkflowSkillId,
  completedWorkflowSkillsSinceStepEntry,
  missingWorkflowStepSkills,
} from './skill-evidence.js'

const line = (value: unknown): string => JSON.stringify(value)

describe('custom workflow skill evidence', () => {
  it('normalizes the plugin namespace and accepts host-completed Skill/CodexSkillRead receipts', () => {
    expect(canonicalWorkflowSkillId('tenon:simple-task')).toBe('simple-task')
    expect(completedWorkflowSkillsSinceStepEntry([
      line({ kind: 'tool', raw: 'Skill: tenon:simple-task' }),
      line({ kind: 'tool', raw: 'CodexSkillRead: verification-before-completion' }),
    ].join('\n'), 'change')).toEqual(new Set(['simple-task', 'verification-before-completion']))
  })

  it('counts only evidence after the latest entry into the current step and ignores malformed lines', () => {
    const history = [
      line({ kind: 'tool', raw: 'Skill: simple-task' }),
      line({ kind: 'transition', from: 'change', to: 'verify', raw: 'change-complete' }),
      line({ kind: 'transition', from: 'verify', to: 'change', raw: 'verify-fail' }),
      '{broken',
      line({ kind: 'tool', raw: 'Skill: unrelated' }),
    ].join('\n')
    expect(completedWorkflowSkillsSinceStepEntry(history, 'change')).toEqual(new Set(['unrelated']))
  })

  it('deduplicates declarations while preserving order and reports every missing mandatory skill', () => {
    expect(missingWorkflowStepSkills([
      { id: 'tenon:simple-task' },
      { id: 'simple-task' },
      { id: 'verification-before-completion', depends_on: ['simple-task'] },
    ], new Set(['simple-task']))).toEqual(['verification-before-completion'])
  })
})
