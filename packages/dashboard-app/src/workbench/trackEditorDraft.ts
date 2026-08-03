import type { WbTrackDefinition } from '../api/client'

type TrackPolicyDraft = WbTrackDefinition['policyProfile']

export interface TrackEditorDraft {
  id: string
  label: string
  workflowDefault: string
  workflowAny: boolean
  workflowAllowed: string
  policyProfile: TrackPolicyDraft
}

export function cloneTrackPolicy(policy: TrackPolicyDraft): TrackPolicyDraft {
  return {
    ...policy,
    routing: policy.routing.enabled ? { ...policy.routing } : { enabled: false },
    skills: { ...policy.skills },
  }
}

export function trackDraftFromDefinition(track: WbTrackDefinition): TrackEditorDraft {
  return {
    id: track.id,
    label: track.label,
    workflowDefault: track.workflow.default,
    workflowAny: track.workflow.allowed === '*',
    workflowAllowed: track.workflow.allowed === '*' ? '' : track.workflow.allowed.join(', '),
    policyProfile: cloneTrackPolicy(track.policyProfile),
  }
}

export function allowedFromTrackDraft(draft: TrackEditorDraft): '*' | string[] {
  if (draft.workflowAny) return '*'
  return [...new Set(draft.workflowAllowed.split(',').map((value) => value.trim()).filter(Boolean))]
}

export function trackDraftHasRequiredFields(draft: TrackEditorDraft): boolean {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(draft.id)
    && draft.label.trim() !== ''
    && draft.workflowDefault.trim() !== ''
}

export function effectiveTrackDraft(draft: TrackEditorDraft): WbTrackDefinition {
  return {
    id: draft.id,
    label: draft.label.trim(),
    builtin: false,
    workflow: { default: draft.workflowDefault.trim(), allowed: allowedFromTrackDraft(draft) },
    policyProfile: cloneTrackPolicy(draft.policyProfile),
  }
}
