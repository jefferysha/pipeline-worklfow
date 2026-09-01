import {
  BOARD_COMMAND_SCHEMA,
  CAPABILITY_ASSESSMENT_SCHEMA,
  DEVELOPMENT_REQUEST_SCHEMA,
  GATE_EVALUATION_SCHEMA,
  REPOSITORY_CONTEXT_SCHEMA,
  SKILL_RESULT_SCHEMA,
  VALIDATION_REPORT_SCHEMA,
  type AssessmentQuestionV1,
  type BoardCommandV1,
  type BoardCommandBaseV1,
  type CapabilityAssessmentV1,
  type DevelopmentRequestV1,
  type GateEvaluationV1,
  type RepositoryContextSnapshotV1,
  type SkillArtifactRefV1,
  type SkillResultEnvelopeV1,
  type ValidationCheckV1,
  type ValidationReportV1,
  type WorkGraphV1,
} from './types.js'

export interface OrchestrationCodecError {
  readonly code: 'json-invalid' | 'object-invalid' | 'unknown-field' | 'field-invalid'
  readonly path: string
}

export type OrchestrationDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly OrchestrationCodecError[] }

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function parse(value: unknown): { readonly value?: unknown; readonly error?: OrchestrationCodecError } {
  if (typeof value !== 'string') return { value }
  try {
    return { value: JSON.parse(value) as unknown }
  } catch {
    return { error: { code: 'json-invalid', path: '$' } }
  }
}

function object(value: unknown, path: string, errors: OrchestrationCodecError[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    errors.push({ code: 'object-invalid', path })
    return undefined
  }
  return value as Record<string, unknown>
}

function closed(raw: Record<string, unknown>, allowed: readonly string[], path: string, errors: OrchestrationCodecError[]): void {
  const accepted = new Set(allowed)
  for (const key of Object.keys(raw)) if (!accepted.has(key)) errors.push({ code: 'unknown-field', path: `${path}.${key}` })
}

function text(value: unknown, path: string, errors: OrchestrationCodecError[], pattern?: RegExp): string | undefined {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim() || value.length > 8_192 || (pattern !== undefined && !pattern.test(value))) {
    errors.push({ code: 'field-invalid', path })
    return undefined
  }
  return value
}

function optionalText(value: unknown, path: string, errors: OrchestrationCodecError[], pattern?: RegExp): string | undefined {
  return value === undefined ? undefined : text(value, path, errors, pattern)
}

function timestamp(value: unknown, path: string, errors: OrchestrationCodecError[]): string | undefined {
  return text(value, path, errors, UTC)
}

function bool(value: unknown, path: string, errors: OrchestrationCodecError[]): boolean | undefined {
  if (typeof value !== 'boolean') errors.push({ code: 'field-invalid', path })
  return typeof value === 'boolean' ? value : undefined
}

function integer(value: unknown, path: string, errors: OrchestrationCodecError[]): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) errors.push({ code: 'field-invalid', path })
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function array(value: unknown, path: string, errors: OrchestrationCodecError[]): readonly unknown[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 1_024) {
    errors.push({ code: 'field-invalid', path })
    return undefined
  }
  return value
}

function strings(value: unknown, path: string, errors: OrchestrationCodecError[]): readonly string[] {
  const values = array(value, path, errors) ?? []
  return values.map((entry, index) => text(entry, `${path}[${index}]`, errors) ?? '')
}

function decodeSkillSelection(value: unknown, path: string, errors: OrchestrationCodecError[]): DevelopmentRequestV1['user_skills'][number] | undefined {
  const raw = object(value, path, errors)
  if (raw === undefined) return undefined
  closed(raw, ['id', 'mode', 'depends_on'], path, errors)
  const id = text(raw.id, `${path}.id`, errors, IDENTIFIER)
  const mode = raw.mode === 'serial' || raw.mode === 'parallel' ? raw.mode : undefined
  if (mode === undefined) errors.push({ code: 'field-invalid', path: `${path}.mode` })
  return id === undefined || mode === undefined ? undefined : { id, mode, depends_on: strings(raw.depends_on, `${path}.depends_on`, errors) }
}

function decodeMcpSelection(value: unknown, path: string, errors: OrchestrationCodecError[]): DevelopmentRequestV1['user_mcps'][number] | undefined {
  const raw = object(value, path, errors)
  if (raw === undefined) return undefined
  closed(raw, ['id', 'required'], path, errors)
  const id = text(raw.id, `${path}.id`, errors, IDENTIFIER)
  const required = bool(raw.required, `${path}.required`, errors)
  return id === undefined || required === undefined ? undefined : { id, required }
}

export function decodeDevelopmentRequestV1(input: unknown): OrchestrationDecodeResult<DevelopmentRequestV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  closed(raw, ['schema_version', 'request_id', 'project_id', 'change_id', 'intent', 'created_at', 'auto_select', 'user_skills', 'user_mcps'], '$', errors)
  const schema = raw.schema_version === DEVELOPMENT_REQUEST_SCHEMA
  if (!schema) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  const request_id = text(raw.request_id, '$.request_id', errors, IDENTIFIER)
  const project_id = text(raw.project_id, '$.project_id', errors, IDENTIFIER)
  const change_id = text(raw.change_id, '$.change_id', errors, IDENTIFIER)
  const intent = text(raw.intent, '$.intent', errors)
  const created_at = timestamp(raw.created_at, '$.created_at', errors)
  const auto_select = bool(raw.auto_select, '$.auto_select', errors)
  const skillEntries = array(raw.user_skills, '$.user_skills', errors) ?? []
  const user_skills = skillEntries.map((entry, index) => decodeSkillSelection(entry, `$.user_skills[${index}]`, errors)).filter((entry): entry is DevelopmentRequestV1['user_skills'][number] => entry !== undefined)
  const mcpEntries = array(raw.user_mcps, '$.user_mcps', errors) ?? []
  const user_mcps = mcpEntries.map((entry, index) => decodeMcpSelection(entry, `$.user_mcps[${index}]`, errors)).filter((entry): entry is DevelopmentRequestV1['user_mcps'][number] => entry !== undefined)
  if (errors.length > 0 || request_id === undefined || project_id === undefined || change_id === undefined || intent === undefined || created_at === undefined || auto_select === undefined) return { ok: false, errors }
  return { ok: true, value: { schema_version: DEVELOPMENT_REQUEST_SCHEMA, request_id, project_id, change_id, intent, created_at, auto_select, user_skills, user_mcps } }
}

export function decodeCapabilityAssessmentV1(input: unknown): OrchestrationDecodeResult<CapabilityAssessmentV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  closed(raw, ['schema_version', 'assessment_id', 'request_id', 'status', 'source', 'confidence', 'capability_requirements', 'mcp_requirements', 'constraints', 'risks', 'questions', 'signals', 'assessed_at'], '$', errors)
  if (raw.schema_version !== CAPABILITY_ASSESSMENT_SCHEMA) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  const assessment_id = text(raw.assessment_id, '$.assessment_id', errors, IDENTIFIER)
  const request_id = text(raw.request_id, '$.request_id', errors, IDENTIFIER)
  const status = raw.status === 'complete' || raw.status === 'needs-input' || raw.status === 'uncertain' ? raw.status : undefined
  const source = raw.source === 'user' || raw.source === 'rule' || raw.source === 'model' || raw.source === 'system' ? raw.source : undefined
  const confidence = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : undefined
  if (status === undefined) errors.push({ code: 'field-invalid', path: '$.status' })
  if (source === undefined) errors.push({ code: 'field-invalid', path: '$.source' })
  if (confidence === undefined) errors.push({ code: 'field-invalid', path: '$.confidence' })
  const capability_requirements = strings(raw.capability_requirements, '$.capability_requirements', errors)
  const mcp_requirements = strings(raw.mcp_requirements, '$.mcp_requirements', errors)
  const constraints = strings(raw.constraints, '$.constraints', errors)
  const risks = strings(raw.risks, '$.risks', errors)
  const questionEntries = array(raw.questions, '$.questions', errors) ?? []
  const questions: AssessmentQuestionV1[] = []
  for (const [index, entry] of questionEntries.entries()) {
    const question = object(entry, `$.questions[${index}]`, errors)
    if (question === undefined) continue
    closed(question, ['id', 'prompt', 'required'], `$.questions[${index}]`, errors)
    const id = text(question.id, `$.questions[${index}].id`, errors, IDENTIFIER)
    const prompt = text(question.prompt, `$.questions[${index}].prompt`, errors)
    const required = bool(question.required, `$.questions[${index}].required`, errors)
    if (id !== undefined && prompt !== undefined && required !== undefined) questions.push({ id, prompt, required })
  }
  const signalRaw = object(raw.signals, '$.signals', errors)
  const signals: Record<string, string> = {}
  if (signalRaw !== undefined) for (const [key, value] of Object.entries(signalRaw)) {
    const signal = text(value, `$.signals.${key}`, errors)
    if (signal !== undefined) signals[key] = signal
  }
  const assessed_at = timestamp(raw.assessed_at, '$.assessed_at', errors)
  if (errors.length > 0 || assessment_id === undefined || request_id === undefined || status === undefined || source === undefined || confidence === undefined || assessed_at === undefined) return { ok: false, errors }
  return { ok: true, value: { schema_version: CAPABILITY_ASSESSMENT_SCHEMA, assessment_id, request_id, status, source, confidence, capability_requirements, mcp_requirements, constraints, risks, questions, signals, assessed_at } }
}

export function decodeSkillResultEnvelopeV1(input: unknown): OrchestrationDecodeResult<SkillResultEnvelopeV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  closed(raw, ['schema_version', 'result_id', 'run_id', 'status', 'contract_status', 'output_schema_id', 'summary', 'artifacts', 'diagnostics', 'raw_output', 'produced_at'], '$', errors)
  if (raw.schema_version !== SKILL_RESULT_SCHEMA) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  const result_id = text(raw.result_id, '$.result_id', errors, IDENTIFIER)
  const run_id = text(raw.run_id, '$.run_id', errors, IDENTIFIER)
  const status = ['completed', 'failed', 'incomplete', 'corrupt'].includes(String(raw.status)) ? raw.status as SkillResultEnvelopeV1['status'] : undefined
  const contract_status = ['validated', 'unknown', 'invalid'].includes(String(raw.contract_status)) ? raw.contract_status as SkillResultEnvelopeV1['contract_status'] : undefined
  const output_schema_id = optionalText(raw.output_schema_id, '$.output_schema_id', errors, IDENTIFIER)
  const summary = optionalText(raw.summary, '$.summary', errors)
  const diagnostics = strings(raw.diagnostics, '$.diagnostics', errors)
  const produced_at = timestamp(raw.produced_at, '$.produced_at', errors)
  const artifactEntries = array(raw.artifacts, '$.artifacts', errors) ?? []
  const artifacts: SkillArtifactRefV1[] = []
  for (const [index, entry] of artifactEntries.entries()) {
    const artifact = object(entry, `$.artifacts[${index}]`, errors)
    if (artifact === undefined) continue
    closed(artifact, ['kind', 'ref', 'digest', 'label'], `$.artifacts[${index}]`, errors)
    const kind = ['file', 'document', 'artifact', 'value', 'unknown'].includes(String(artifact.kind)) ? artifact.kind as SkillArtifactRefV1['kind'] : undefined
    const ref = text(artifact.ref, `$.artifacts[${index}].ref`, errors)
    const digest = optionalText(artifact.digest, `$.artifacts[${index}].digest`, errors)
    const label = optionalText(artifact.label, `$.artifacts[${index}].label`, errors)
    if (kind !== undefined && ref !== undefined) artifacts.push({ kind, ref, ...(digest === undefined ? {} : { digest }), ...(label === undefined ? {} : { label }) })
  }
  if (status === undefined) errors.push({ code: 'field-invalid', path: '$.status' })
  if (contract_status === undefined) errors.push({ code: 'field-invalid', path: '$.contract_status' })
  if (errors.length > 0 || result_id === undefined || run_id === undefined || status === undefined || contract_status === undefined || produced_at === undefined) return { ok: false, errors }
  return { ok: true, value: { schema_version: SKILL_RESULT_SCHEMA, result_id, run_id, status, contract_status, ...(output_schema_id === undefined ? {} : { output_schema_id }), ...(summary === undefined ? {} : { summary }), artifacts, diagnostics, ...(raw.raw_output === undefined ? {} : { raw_output: raw.raw_output }), produced_at } }
}

function decodeContext(value: unknown, errors: OrchestrationCodecError[]): RepositoryContextSnapshotV1 | undefined {
  const raw = object(value, '$.context', errors)
  if (raw === undefined) return undefined
  closed(raw, ['schema_version', 'project_id', 'repository_ref', 'revision', 'branch', 'base_branch', 'dirty', 'observed_at', 'source'], '$.context', errors)
  const project_id = text(raw.project_id, '$.context.project_id', errors, IDENTIFIER)
  const repository_ref = text(raw.repository_ref, '$.context.repository_ref', errors)
  const revision = text(raw.revision, '$.context.revision', errors)
  const branch = text(raw.branch, '$.context.branch', errors)
  const base_branch = text(raw.base_branch, '$.context.base_branch', errors)
  const dirty = bool(raw.dirty, '$.context.dirty', errors)
  const observed_at = timestamp(raw.observed_at, '$.context.observed_at', errors)
  const source = raw.source === 'user' || raw.source === 'rule' || raw.source === 'model' || raw.source === 'system' ? raw.source : undefined
  if (raw.schema_version !== REPOSITORY_CONTEXT_SCHEMA) errors.push({ code: 'field-invalid', path: '$.context.schema_version' })
  if (source === undefined) errors.push({ code: 'field-invalid', path: '$.context.source' })
  if (project_id === undefined || repository_ref === undefined || revision === undefined || branch === undefined || base_branch === undefined || dirty === undefined || observed_at === undefined || source === undefined) return undefined
  return { schema_version: REPOSITORY_CONTEXT_SCHEMA, project_id, repository_ref, revision, branch, base_branch, dirty, observed_at, source }
}

const COMMAND_TYPES = ['record-assessment', 'attach-work-graph', 'resolve-capabilities', 'start', 'claim-work-item', 'begin-skill-run', 'complete-skill-run', 'record-validation', 'evaluate-gate', 'pause', 'resume', 'retry-work-item', 'cancel'] as const

export function decodeBoardCommandV1(input: unknown): OrchestrationDecodeResult<BoardCommandV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  const type = COMMAND_TYPES.includes(raw.type as typeof COMMAND_TYPES[number]) ? raw.type as typeof COMMAND_TYPES[number] : undefined
  if (raw.schema_version !== BOARD_COMMAND_SCHEMA) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  if (type === undefined) errors.push({ code: 'field-invalid', path: '$.type' })
  const command_id = text(raw.command_id, '$.command_id', errors, IDENTIFIER)
  const change_id = text(raw.change_id, '$.change_id', errors, IDENTIFIER)
  const expected_revision = integer(raw.expected_revision, '$.expected_revision', errors)
  const actor = text(raw.actor, '$.actor', errors, IDENTIFIER)
  const issued_at = timestamp(raw.issued_at, '$.issued_at', errors)
  const baseKeys = ['schema_version', 'command_id', 'change_id', 'expected_revision', 'actor', 'issued_at', 'type']
  const extraKeys: Record<typeof COMMAND_TYPES[number], readonly string[]> = {
    'record-assessment': ['assessment', 'context'], 'attach-work-graph': ['graph'], 'resolve-capabilities': ['resolution'], 'start': [],
    'claim-work-item': ['work_item_id', 'worker_id'], 'begin-skill-run': ['work_item_id', 'run_id', 'skill_id', 'skill_version', 'now'],
    'complete-skill-run': ['run_id', 'result'], 'record-validation': ['report'], 'evaluate-gate': ['gate'], 'pause': ['reason'], 'resume': [],
    'retry-work-item': ['work_item_id'], 'cancel': ['reason'],
  }
  if (type !== undefined) closed(raw, [...baseKeys, ...extraKeys[type]], '$', errors)
  const context = type === 'record-assessment' ? decodeContext(raw.context, errors) : undefined
  const assessment = type === 'record-assessment' ? decodeCapabilityAssessmentV1(raw.assessment) : undefined
  if (assessment !== undefined && !assessment.ok) errors.push(...assessment.errors)
  if (type === 'record-assessment' && (context === undefined || assessment === undefined || !assessment.ok)) errors.push({ code: 'field-invalid', path: '$.record-assessment' })
  if (errors.length > 0 || type === undefined || command_id === undefined || change_id === undefined || expected_revision === undefined || actor === undefined || issued_at === undefined) return { ok: false, errors }
  const base: BoardCommandBaseV1 = { schema_version: BOARD_COMMAND_SCHEMA, command_id, change_id, expected_revision, actor, issued_at }
  switch (type) {
    case 'record-assessment':
      if (context === undefined || assessment === undefined || !assessment.ok) return { ok: false, errors: [{ code: 'field-invalid', path: '$.record-assessment' }] }
      return { ok: true, value: { ...base, type, context, assessment: assessment.value } }
    case 'complete-skill-run': {
      const result = decodeSkillResultEnvelopeV1(raw.result)
      if (!result.ok) return { ok: false, errors: result.errors }
      const run_id = text(raw.run_id, '$.run_id', errors, IDENTIFIER)
      if (run_id === undefined || errors.length > 0) return { ok: false, errors }
      return { ok: true, value: { ...base, type, run_id, result: result.value } }
    }
    case 'record-validation': {
      const report = decodeValidationReportV1(raw.report)
      if (!report.ok) return { ok: false, errors: report.errors }
      return { ok: true, value: { ...base, type, report: report.value } }
    }
    case 'evaluate-gate': {
      const gate = decodeGateEvaluationV1(raw.gate)
      if (!gate.ok) return { ok: false, errors: gate.errors }
      return { ok: true, value: { ...base, type, gate: gate.value } }
    }
    case 'attach-work-graph': {
      const graph = raw.graph as WorkGraphV1
      return { ok: true, value: { ...base, type, graph } }
    }
    case 'resolve-capabilities':
      return { ok: true, value: { ...base, type, resolution: raw.resolution as import('./types.js').CapabilityResolutionV1 } }
    case 'start':
    case 'resume':
      return { ok: true, value: { ...base, type } }
    case 'claim-work-item':
    case 'retry-work-item': {
      const work_item_id = text(raw.work_item_id, '$.work_item_id', errors, IDENTIFIER)
      if (work_item_id === undefined || errors.length > 0) return { ok: false, errors }
      if (type === 'retry-work-item') return { ok: true, value: { ...base, type, work_item_id } }
      const worker_id = text(raw.worker_id, '$.worker_id', errors, IDENTIFIER)
      if (worker_id === undefined || errors.length > 0) return { ok: false, errors }
      return { ok: true, value: { ...base, type, work_item_id, worker_id } }
    }
    case 'begin-skill-run': {
      const work_item_id = text(raw.work_item_id, '$.work_item_id', errors, IDENTIFIER)
      const run_id = text(raw.run_id, '$.run_id', errors, IDENTIFIER)
      const skill_id = text(raw.skill_id, '$.skill_id', errors, IDENTIFIER)
      const skill_version = text(raw.skill_version, '$.skill_version', errors)
      const now = timestamp(raw.now, '$.now', errors)
      if (work_item_id === undefined || run_id === undefined || skill_id === undefined || skill_version === undefined || now === undefined || errors.length > 0) return { ok: false, errors }
      return { ok: true, value: { ...base, type, work_item_id, run_id, skill_id, skill_version, now } }
    }
    case 'pause':
    case 'cancel': {
      const reason = text(raw.reason, '$.reason', errors)
      if (reason === undefined || errors.length > 0) return { ok: false, errors }
      return { ok: true, value: { ...base, type, reason } }
    }
  }
}

export function decodeGateEvaluationV1(input: unknown): OrchestrationDecodeResult<GateEvaluationV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  closed(raw, ['schema_version', 'gate_id', 'change_id', 'kind', 'status', 'actor', 'rationale', 'evaluated_at'], '$', errors)
  if (raw.schema_version !== GATE_EVALUATION_SCHEMA) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  const gate_id = text(raw.gate_id, '$.gate_id', errors, IDENTIFIER)
  const change_id = text(raw.change_id, '$.change_id', errors, IDENTIFIER)
  const actor = text(raw.actor, '$.actor', errors, IDENTIFIER)
  const kind = ['input', 'review', 'verification', 'release'].includes(String(raw.kind)) ? raw.kind as GateEvaluationV1['kind'] : undefined
  const status = ['pending', 'passed', 'rejected', 'waived'].includes(String(raw.status)) ? raw.status as GateEvaluationV1['status'] : undefined
  const rationale = optionalText(raw.rationale, '$.rationale', errors)
  const evaluated_at = timestamp(raw.evaluated_at, '$.evaluated_at', errors)
  if (kind === undefined) errors.push({ code: 'field-invalid', path: '$.kind' })
  if (status === undefined) errors.push({ code: 'field-invalid', path: '$.status' })
  if (errors.length > 0 || gate_id === undefined || change_id === undefined || actor === undefined || kind === undefined || status === undefined || evaluated_at === undefined) return { ok: false, errors }
  return { ok: true, value: { schema_version: GATE_EVALUATION_SCHEMA, gate_id, change_id, kind, status, actor, ...(rationale === undefined ? {} : { rationale }), evaluated_at } }
}

export function decodeValidationReportV1(input: unknown): OrchestrationDecodeResult<ValidationReportV1> {
  const parsed = parse(input)
  if (parsed.error !== undefined) return { ok: false, errors: [parsed.error] }
  const errors: OrchestrationCodecError[] = []
  const raw = object(parsed.value, '$', errors)
  if (raw === undefined) return { ok: false, errors }
  closed(raw, ['schema_version', 'report_id', 'work_item_id', 'status', 'checks', 'produced_at'], '$', errors)
  if (raw.schema_version !== VALIDATION_REPORT_SCHEMA) errors.push({ code: 'field-invalid', path: '$.schema_version' })
  const report_id = text(raw.report_id, '$.report_id', errors, IDENTIFIER)
  const work_item_id = text(raw.work_item_id, '$.work_item_id', errors, IDENTIFIER)
  const status = ['pass', 'fail', 'incomplete'].includes(String(raw.status)) ? raw.status as ValidationReportV1['status'] : undefined
  const produced_at = timestamp(raw.produced_at, '$.produced_at', errors)
  const checks: ValidationCheckV1[] = []
  const checkEntries = array(raw.checks, '$.checks', errors) ?? []
  for (const [index, entry] of checkEntries.entries()) {
    const check = object(entry, `$.checks[${index}]`, errors)
    if (check === undefined) continue
    closed(check, ['id', 'status', 'validator', 'evidence_refs', 'message'], `$.checks[${index}]`, errors)
    const id = text(check.id, `$.checks[${index}].id`, errors, IDENTIFIER)
    const checkStatus = ['pass', 'fail', 'unknown'].includes(String(check.status)) ? check.status as ValidationCheckV1['status'] : undefined
    const validator = text(check.validator, `$.checks[${index}].validator`, errors, IDENTIFIER)
    const evidence_refs = strings(check.evidence_refs, `$.checks[${index}].evidence_refs`, errors)
    const message = optionalText(check.message, `$.checks[${index}].message`, errors)
    if (checkStatus === undefined) errors.push({ code: 'field-invalid', path: `$.checks[${index}].status` })
    if (id !== undefined && checkStatus !== undefined && validator !== undefined) checks.push({ id, status: checkStatus, validator, evidence_refs, ...(message === undefined ? {} : { message }) })
  }
  if (status === undefined) errors.push({ code: 'field-invalid', path: '$.status' })
  if (errors.length > 0 || report_id === undefined || work_item_id === undefined || status === undefined || produced_at === undefined) return { ok: false, errors }
  return { ok: true, value: { schema_version: VALIDATION_REPORT_SCHEMA, report_id, work_item_id, status, checks, produced_at } }
}
