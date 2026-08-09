/** Canonical workflow identity predicates shared by definition validation and observability codecs. */
const WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u

export function isValidWorkflowName(value: string): boolean {
  return WORKFLOW_NAME_RE.test(value)
}

export function isDefaultWorkflowName(value: string): boolean {
  return value === 'default'
}
