/**
 * Governed OpenSpec document contract.
 *
 * This module deliberately contains only deterministic workflow rules. Filesystem persistence,
 * digests, and receipts live in state/document-ledger.ts so CLI, server, and Dashboard consume one
 * matrix without making the workflow domain depend on Node I/O.
 */
import type { WorkflowDef } from './types.js'

export const DOCUMENT_CONTRACT_PHASES = [
  'open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive',
] as const

export type DocumentContractPhase = (typeof DOCUMENT_CONTRACT_PHASES)[number]

export const DOCUMENT_KINDS = [
  'proposal',
  'openspec-design',
  'tasks',
  'superpower-design',
  'adr',
  'delta-spec',
  'superpower-plan',
  'plan',
  'verification-report',
  'applied-spec',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export type OpenSpecContract = 'required'

export interface DocumentOutputRequirement {
  readonly kind: DocumentKind
  /** Specific skills that are allowed to author and register this document kind. */
  readonly producerCandidates: readonly string[]
}

const OUTPUTS_BY_PHASE: Readonly<Record<DocumentContractPhase, readonly DocumentOutputRequirement[]>> = {
  open: [
    { kind: 'proposal', producerCandidates: ['openspec-propose', 'opsx:propose'] },
    { kind: 'openspec-design', producerCandidates: ['openspec-propose', 'opsx:propose'] },
    { kind: 'tasks', producerCandidates: ['openspec-propose', 'opsx:propose'] },
  ],
  explore: [
    { kind: 'superpower-design', producerCandidates: ['brainstorming', 'superpowers:brainstorming'] },
    { kind: 'adr', producerCandidates: ['pipeline-explore', 'pipeline-lite:pipeline-explore', 'brainstorming', 'superpowers:brainstorming'] },
  ],
  spec: [
    { kind: 'delta-spec', producerCandidates: ['openspec-propose', 'opsx:propose'] },
    { kind: 'superpower-plan', producerCandidates: ['writing-plans', 'superpowers:writing-plans'] },
    { kind: 'plan', producerCandidates: ['writing-plans', 'superpowers:writing-plans'] },
  ],
  build: [],
  verify: [
    {
      kind: 'verification-report',
      producerCandidates: ['verification-before-completion', 'superpowers:verification-before-completion', 'pipeline-verify', 'pipeline-lite:pipeline-verify'],
    },
  ],
  ship: [
    { kind: 'applied-spec', producerCandidates: ['openspec-apply-change', 'opsx:apply'] },
  ],
  archive: [],
}

/**
 * A small number of governed documents deliberately remain living documents after their first
 * phase. Their newest digest must identify the *current* phase skill that changed it; retaining
 * the original producer after a later edit would make the ledger's hash/provenance pair false.
 *
 * These entries do not add new phase-exit requirements. They only grant a later phase authority
 * to replace an existing record with fresh, phase-local Skill evidence.
 */
const MUTABLE_RECORDS_BY_PHASE: Readonly<Record<DocumentContractPhase, readonly DocumentOutputRequirement[]>> = {
  open: [],
  explore: [
    // Open creates intentionally small OpenSpec scaffolds. Explore owns consolidating the
    // validated problem framing and initial design hypothesis into those living documents; the
    // resulting digest must therefore be attributed to the phase driver, not left under the
    // now-stale open-phase openspec-propose receipt.
    { kind: 'proposal', producerCandidates: ['pipeline-explore', 'pipeline-lite:pipeline-explore'] },
    { kind: 'openspec-design', producerCandidates: ['pipeline-explore', 'pipeline-lite:pipeline-explore'] },
    { kind: 'tasks', producerCandidates: ['pipeline-explore', 'pipeline-lite:pipeline-explore'] },
  ],
  spec: [
    { kind: 'proposal', producerCandidates: ['pipeline-spec', 'pipeline-lite:pipeline-spec'] },
    { kind: 'openspec-design', producerCandidates: ['pipeline-spec', 'pipeline-lite:pipeline-spec'] },
    { kind: 'tasks', producerCandidates: ['pipeline-spec', 'pipeline-lite:pipeline-spec'] },
    { kind: 'superpower-design', producerCandidates: ['pipeline-spec', 'pipeline-lite:pipeline-spec'] },
  ],
  build: [
    { kind: 'tasks', producerCandidates: ['pipeline-build', 'pipeline-lite:pipeline-build'] },
  ],
  verify: [
    { kind: 'tasks', producerCandidates: ['pipeline-verify', 'pipeline-lite:pipeline-verify'] },
  ],
  ship: [
    { kind: 'tasks', producerCandidates: ['pipeline-ship', 'pipeline-lite:pipeline-ship'] },
  ],
  archive: [
    { kind: 'tasks', producerCandidates: ['pipeline-archive', 'pipeline-lite:pipeline-archive'] },
  ],
}

const READS_BY_PHASE: Readonly<Record<DocumentContractPhase, readonly DocumentKind[]>> = {
  open: [],
  explore: ['proposal', 'openspec-design', 'tasks'],
  spec: ['proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr'],
  build: [
    'proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr', 'delta-spec', 'superpower-plan', 'plan',
  ],
  verify: [
    'proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr', 'delta-spec', 'superpower-plan', 'plan',
  ],
  ship: [
    'proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr', 'delta-spec', 'superpower-plan', 'plan',
    'verification-report',
  ],
  archive: [
    'proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr', 'delta-spec', 'superpower-plan', 'plan',
    'verification-report', 'applied-spec',
  ],
}

const CANONICAL_TRANSITIONS: Readonly<Record<DocumentContractPhase, readonly DocumentContractPhase[]>> = {
  open: ['explore'],
  explore: ['spec'],
  spec: ['build'],
  build: ['verify', 'spec'],
  verify: ['ship', 'build'],
  ship: ['archive'],
  archive: [],
}

const REVIEW_PHASES: ReadonlySet<DocumentContractPhase> = new Set(['explore', 'spec', 'verify'])

/**
 * A governed custom workflow is not merely a seven-node drawing.  Its runtime must expose the
 * build target as an explicit output and consume it during verification, otherwise a later step
 * cannot truthfully read the immutable target that OpenSpec evidence refers to.
 */
const REQUIRED_RUNTIME_REFS: Readonly<Partial<Record<DocumentContractPhase, {
  readonly inputs?: readonly { readonly field: string; readonly type: string }[]
  readonly outputs?: readonly { readonly field: string; readonly type: string }[]
}>>> = {
  build: { outputs: [{ field: 'build_sha', type: 'string' }] },
  verify: {
    inputs: [{ field: 'build_sha', type: 'string' }],
    outputs: [{ field: 'verification_report', type: 'file_path' }],
  },
}

function hasFieldRef(
  refs: readonly { readonly field: string; readonly type: string }[],
  required: { readonly field: string; readonly type: string },
): boolean {
  return refs.some((ref) => ref.field === required.field && ref.type === required.type)
}

/**
 * A custom workflow may opt into the document contract only when it also declares the phase skills
 * that make each receipt meaningful.  This is intentionally a small role-based matrix rather than
 * a giant copy of the default manifest: the packaged bare IDs are canonical, while legacy host
 * namespaces remain accepted for existing custom workflows. This still prevents a workflow from
 * claiming OpenSpec governance with seven empty lanes.
 */
const REQUIRED_SKILL_GROUPS: Readonly<Record<DocumentContractPhase, readonly {
  readonly label: string
  readonly alternatives: readonly string[]
}[]>> = {
  open: [
    { label: 'OpenSpec proposal', alternatives: ['openspec-propose', 'opsx:propose'] },
    { label: 'pipeline open', alternatives: ['pipeline-open', 'pipeline-lite:pipeline-open'] },
  ],
  explore: [
    { label: 'pipeline explore', alternatives: ['pipeline-explore', 'pipeline-lite:pipeline-explore'] },
    { label: 'Superpower brainstorming', alternatives: ['brainstorming', 'superpowers:brainstorming'] },
  ],
  spec: [
    { label: 'pipeline spec', alternatives: ['pipeline-spec', 'pipeline-lite:pipeline-spec'] },
    { label: 'OpenSpec delta proposal', alternatives: ['openspec-propose', 'opsx:propose'] },
    { label: 'Superpower plan', alternatives: ['writing-plans', 'superpowers:writing-plans'] },
  ],
  build: [{ label: 'pipeline build', alternatives: ['pipeline-build', 'pipeline-lite:pipeline-build'] }],
  verify: [
    { label: 'pipeline verify', alternatives: ['pipeline-verify', 'pipeline-lite:pipeline-verify'] },
    {
      label: 'Superpower verification',
      alternatives: ['verification-before-completion', 'superpowers:verification-before-completion'],
    },
  ],
  ship: [
    { label: 'pipeline ship', alternatives: ['pipeline-ship', 'pipeline-lite:pipeline-ship'] },
    { label: 'OpenSpec apply', alternatives: ['openspec-apply-change', 'opsx:apply'] },
  ],
  archive: [{ label: 'pipeline archive', alternatives: ['pipeline-archive', 'pipeline-lite:pipeline-archive'] }],
}

function includes<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value)
}

export function isDocumentContractPhase(value: string): value is DocumentContractPhase {
  return includes(DOCUMENT_CONTRACT_PHASES, value)
}

export function isDocumentKind(value: string): value is DocumentKind {
  return includes(DOCUMENT_KINDS, value)
}

export function outputsRequiredForPhase(phase: DocumentContractPhase): readonly DocumentOutputRequirement[] {
  return OUTPUTS_BY_PHASE[phase]
}

export function readsRequiredForPhase(phase: DocumentContractPhase): readonly DocumentKind[] {
  return READS_BY_PHASE[phase]
}

/** All outputs that must exist before a governed phase can complete. */
export function recordsRequiredForPhase(phase: DocumentContractPhase): readonly DocumentOutputRequirement[] {
  const required: DocumentOutputRequirement[] = []
  for (const candidate of DOCUMENT_CONTRACT_PHASES) {
    required.push(...OUTPUTS_BY_PHASE[candidate])
    if (candidate === phase) break
  }
  return required
}

function outputRequirementFor(kind: DocumentKind): DocumentOutputRequirement | undefined {
  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    const requirement = OUTPUTS_BY_PHASE[phase].find((candidate) => candidate.kind === kind)
    if (requirement) return requirement
  }
  return undefined
}

function recordRequirementFor(kind: DocumentKind, phase: DocumentContractPhase): DocumentOutputRequirement | undefined {
  return [...OUTPUTS_BY_PHASE[phase], ...MUTABLE_RECORDS_BY_PHASE[phase]]
    .find((candidate) => candidate.kind === kind)
}

function aliasesForSkill(id: string): readonly string[] {
  const aliases = new Set<string>([id])
  if (id.startsWith('pipeline-lite:')) aliases.add(id.slice('pipeline-lite:'.length))
  if (id.startsWith('superpowers:')) aliases.add(id.slice('superpowers:'.length))
  if (id === 'opsx:propose') aliases.add('openspec-propose')
  if (id === 'openspec-propose') aliases.add('opsx:propose')
  if (id === 'opsx:apply') aliases.add('openspec-apply-change')
  if (id === 'openspec-apply-change') aliases.add('opsx:apply')
  return [...aliases]
}

/** Host aliases are allowed, but a record cannot claim an unrelated phase skill as its producer. */
export function isAcceptedDocumentProducer(kind: DocumentKind, producer: string): boolean {
  const supplied = new Set(aliasesForSkill(producer))
  return producerCandidatesFor(kind).some((candidate) => aliasesForSkill(candidate).some((alias) => supplied.has(alias)))
}

export function producerCandidatesFor(kind: DocumentKind): readonly string[] {
  const candidates = new Set<string>()
  const origin = outputRequirementFor(kind)
  for (const candidate of origin?.producerCandidates ?? []) candidates.add(candidate)
  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    for (const requirement of MUTABLE_RECORDS_BY_PHASE[phase]) {
      if (requirement.kind !== kind) continue
      for (const candidate of requirement.producerCandidates) candidates.add(candidate)
    }
  }
  return [...candidates]
}

/** The phase that first creates a governed document kind. */
export function documentOwnerPhase(kind: DocumentKind): DocumentContractPhase | undefined {
  return DOCUMENT_CONTRACT_PHASES.find((phase) =>
    OUTPUTS_BY_PHASE[phase].some((requirement) => requirement.kind === kind),
  )
}

/** Whether this phase may write a fresh digest for this document kind. */
export function isDocumentRecordAllowedInPhase(kind: DocumentKind, phase: DocumentContractPhase): boolean {
  return recordRequirementFor(kind, phase) !== undefined
}

/** Exact phase-local producer authorization for a newly written digest. */
export function isDocumentProducerAllowedInPhase(
  kind: DocumentKind,
  phase: DocumentContractPhase,
  producer: string,
): boolean {
  const requirement = recordRequirementFor(kind, phase)
  if (!requirement) return false
  const supplied = new Set(aliasesForSkill(producer))
  return requirement.producerCandidates.some((candidate) => aliasesForSkill(candidate).some((alias) => supplied.has(alias)))
}

export function recordProducerCandidatesFor(kind: DocumentKind, phase: DocumentContractPhase): readonly string[] {
  return recordRequirementFor(kind, phase)?.producerCandidates ?? []
}

/** The document kind may only be newly produced by the phase that owns it. */
export function isOutputAllowedInPhase(kind: DocumentKind, phase: DocumentContractPhase): boolean {
  return OUTPUTS_BY_PHASE[phase].some((item) => item.kind === kind)
}

/**
 * Every default change is governed, including PM: a PRD/prototype delivery still needs an
 * inspectable OpenSpec proposal, design, executable plan, and applied spec. Custom workflows opt
 * in explicitly so legacy arbitrary graphs remain compatible instead of merely claiming compliance.
 */
export function isOpenSpecDocumentContractRequired(
  workflowName: string,
  _track: string,
  workflow?: { readonly openspecContract?: WorkflowDef['openspecContract'] },
): boolean {
  if (workflowName === 'default') return true
  return workflow?.openspecContract === 'required'
}

/** A rollback remains available even when forward evidence is stale or incomplete. */
export function shouldEnforceDocumentEvidenceOnTransition(from: string, to: string): boolean {
  const fromIndex = DOCUMENT_CONTRACT_PHASES.indexOf(from as DocumentContractPhase)
  const toIndex = DOCUMENT_CONTRACT_PHASES.indexOf(to as DocumentContractPhase)
  return !(fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex)
}

/** Strict structural validation for a custom workflow declaring OpenSpec governance. */
export function validateOpenSpecContractWorkflow(workflow: WorkflowDef): readonly string[] {
  if (workflow.openspecContract !== 'required') return []

  const errors: string[] = []
  const actualIds = workflow.steps.map((step) => step.id)
  if (actualIds.length !== DOCUMENT_CONTRACT_PHASES.length) {
    errors.push(`openspec_contract: required 必须恰好声明 ${DOCUMENT_CONTRACT_PHASES.length} 个标准阶段`)
  }
  for (const [index, expected] of DOCUMENT_CONTRACT_PHASES.entries()) {
    const actual = actualIds[index]
    if (actual !== expected) {
      errors.push(`openspec_contract: required 的第 ${index + 1} 阶段必须是 '${expected}'（当前 '${actual ?? '缺失'}'）`)
    }
  }

  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    const step = workflow.steps.find((candidate) => candidate.id === phase)
    if (!step) continue
    const expectedTargets = CANONICAL_TRANSITIONS[phase]
    for (const target of expectedTargets) {
      if (!step.transitions.some((transition) => transition.to === target)) {
        errors.push(`openspec_contract: required 要求 '${phase}' 可转换到 '${target}'`)
      }
    }
    if (REVIEW_PHASES.has(phase) && step.gate !== 'review') {
      errors.push(`openspec_contract: required 要求 '${phase}' 的 gate=review`)
    }
    for (const group of REQUIRED_SKILL_GROUPS[phase]) {
      const declared = step.skills.map((skill) => skill.id)
      const satisfied = declared.some((skill) => {
        const aliases = new Set(aliasesForSkill(skill))
        return group.alternatives.some((candidate) => aliasesForSkill(candidate).some((alias) => aliases.has(alias)))
      })
      if (!satisfied) {
        errors.push(
          `openspec_contract: required 要求 '${phase}' 声明 ${group.label} skill（允许: ${group.alternatives.join(' | ')}）`,
        )
      }
    }
    const runtimeRefs = REQUIRED_RUNTIME_REFS[phase]
    for (const required of runtimeRefs?.inputs ?? []) {
      if (!hasFieldRef(step.inputs, required)) {
        errors.push(
          `openspec_contract: required 要求 '${phase}' 声明 input '${required.field}'（type=${required.type}）以读取构建基线`,
        )
      }
    }
    for (const required of runtimeRefs?.outputs ?? []) {
      if (!hasFieldRef(step.outputs, required)) {
        errors.push(
          `openspec_contract: required 要求 '${phase}' 声明 output '${required.field}'（type=${required.type}）以留下可验证证据`,
        )
      }
    }
  }
  return errors
}
