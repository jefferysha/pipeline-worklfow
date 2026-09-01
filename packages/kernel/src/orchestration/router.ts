import type {
  CapabilityAssessmentV1,
  CapabilityResolutionV1,
  DevelopmentRequestV1,
  McpDescriptorV1,
  SelectedMcpV1,
  SelectedSkillV1,
  SkillDescriptorV1,
} from './types.js'

export interface ResolveCapabilitiesInput {
  readonly request: DevelopmentRequestV1
  readonly assessment: CapabilityAssessmentV1
  readonly skills: readonly SkillDescriptorV1[]
  readonly mcps: readonly McpDescriptorV1[]
  readonly resolution_id: string
  readonly resolved_at: string
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function capabilitySet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim()).filter((value) => value !== ''))
}

function hasAllCapabilities(descriptor: { readonly capabilities: readonly string[] }, required: string): boolean {
  const available = capabilitySet(descriptor.capabilities)
  return available.has(required)
}

function findSkill(skills: readonly SkillDescriptorV1[], id: string): SkillDescriptorV1 | undefined {
  return skills.find((skill) => skill.id === id)
}

function findMcp(mcps: readonly McpDescriptorV1[], id: string): McpDescriptorV1 | undefined {
  return mcps.find((mcp) => mcp.id === id)
}

function dependencyCycle(ids: readonly string[], dependencies: Readonly<Record<string, readonly string[]>>): boolean {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of dependencies[id] ?? []) if (visit(dependency)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return ids.some((id) => visit(id))
}

function parallelWriteConflicts(selected: readonly SelectedSkillV1[], skills: readonly SkillDescriptorV1[]): string[] {
  const conflicts: string[] = []
  const parallel = selected.filter((skill) => skill.mode === 'parallel')
  for (let index = 0; index < parallel.length; index += 1) {
    const left = findSkill(skills, parallel[index]?.id ?? '')
    if (left === undefined) continue
    for (let next = index + 1; next < parallel.length; next += 1) {
      const right = findSkill(skills, parallel[next]?.id ?? '')
      if (right === undefined) continue
      const leftWrites = left.resource_claims.filter((claim) => claim.access === 'write').map((claim) => claim.key)
      const rightWrites = new Set(right.resource_claims.filter((claim) => claim.access === 'write').map((claim) => claim.key))
      for (const resource of leftWrites) if (rightWrites.has(resource)) conflicts.push(`${left.id} 与 ${right.id} 并行写入 ${resource}`)
    }
  }
  return unique(conflicts)
}

/**
 * v1 能力路由器：显式用户选择优先；缺口才按稳定输入顺序自动选择。
 * 这里不调用模型、不猜测 Skill 输出，只产出可审计的选择和 blocker。
 */
export function resolveCapabilities(input: ResolveCapabilitiesInput): CapabilityResolutionV1 {
  const requiredCapabilities = unique(input.assessment.capability_requirements)
  const selectedSkills: SelectedSkillV1[] = []
  const selectedMcps: SelectedMcpV1[] = []
  const unresolvedCapabilities: string[] = []
  const blockers: string[] = []
  const decisions: CapabilityResolutionV1['decisions'][number][] = []
  const skillIds = input.request.user_skills.map((selection) => selection.id)
  const dependencies: Record<string, readonly string[]> = Object.fromEntries(
    input.request.user_skills.map((selection) => [selection.id, selection.depends_on]),
  )

  if (new Set(skillIds).size !== skillIds.length) blockers.push('用户 Skill 选择包含重复 id')
  for (const selection of input.request.user_skills) {
    if (selection.depends_on.some((dependency) => !skillIds.includes(dependency))) {
      blockers.push(`Skill ${selection.id} 引用了未选择的依赖`)
    }
  }
  if (dependencyCycle(skillIds, dependencies)) blockers.push('Skill 依赖图存在环')

  for (const selection of input.request.user_skills) {
    const descriptor = findSkill(input.skills, selection.id)
    if (descriptor === undefined) {
      blockers.push(`找不到用户选择的 Skill ${selection.id}`)
      continue
    }
    if (descriptor.availability === 'unavailable') blockers.push(`Skill ${selection.id} 当前不可用`)
    if (descriptor.availability === 'unknown') blockers.push(`Skill ${selection.id} 可用性未知`)
    if (selection.mode === 'parallel' && !descriptor.supports_parallel) blockers.push(`Skill ${selection.id} 不支持并行执行`)
    selectedSkills.push({ id: descriptor.id, version: descriptor.version, source: 'user', mode: selection.mode, depends_on: selection.depends_on })
  }

  for (const requirement of requiredCapabilities) {
    const explicit = selectedSkills.find((skill) => hasAllCapabilities(findSkill(input.skills, skill.id) ?? { capabilities: [] }, requirement))
    if (explicit !== undefined) {
      decisions.push({ capability: requirement, selected_id: explicit.id, source: 'user', rationale: '命中用户显式 Skill 选择' })
      continue
    }
    if (input.request.auto_select) {
      const candidate = input.skills.find((skill) => skill.availability === 'available' && hasAllCapabilities(skill, requirement))
      if (candidate !== undefined) {
        if (!selectedSkills.some((skill) => skill.id === candidate.id)) {
          selectedSkills.push({ id: candidate.id, version: candidate.version, source: 'auto', mode: 'serial', depends_on: [] })
        }
        decisions.push({ capability: requirement, selected_id: candidate.id, source: 'auto', rationale: '按 descriptor 输入顺序自动选择' })
        continue
      }
    }
    unresolvedCapabilities.push(requirement)
    decisions.push({ capability: requirement, source: 'unresolved', rationale: input.request.auto_select ? '没有可用且声明该能力的 Skill' : 'auto_select=false 且无显式 Skill 覆盖' })
  }

  for (const selection of input.request.user_mcps) {
    const descriptor = findMcp(input.mcps, selection.id)
    if (descriptor === undefined) {
      if (selection.required) blockers.push(`找不到用户选择的 MCP ${selection.id}`)
      continue
    }
    if (descriptor.availability === 'unavailable' || descriptor.availability === 'unknown') {
      if (selection.required) blockers.push(`MCP ${selection.id} 当前不可用或可用性未知`)
      continue
    }
    selectedMcps.push({ id: descriptor.id, version: descriptor.version, source: 'user', required: selection.required })
  }

  for (const requirement of unique(input.assessment.mcp_requirements)) {
    if (selectedMcps.some((mcp) => findMcp(input.mcps, mcp.id)?.capabilities.includes(requirement) === true)) continue
    if (input.request.auto_select) {
      const candidate = input.mcps.find((mcp) => mcp.availability === 'available' && mcp.capabilities.includes(requirement))
      if (candidate !== undefined) {
        if (!selectedMcps.some((mcp) => mcp.id === candidate.id)) selectedMcps.push({ id: candidate.id, version: candidate.version, source: 'auto', required: true })
        continue
      }
    }
    blockers.push(`没有 MCP 满足 ${requirement}`)
  }

  blockers.push(...parallelWriteConflicts(selectedSkills, input.skills))
  const needsInput = input.assessment.status !== 'complete' || input.assessment.questions.some((question) => question.required)
  const status: CapabilityResolutionV1['status'] = blockers.length > 0
    ? 'blocked'
    : needsInput || unresolvedCapabilities.length > 0 ? 'needs-input' : 'resolved'
  return {
    schema_version: 'capability-resolution/v1',
    resolution_id: input.resolution_id,
    assessment_id: input.assessment.assessment_id,
    status,
    required_capabilities: requiredCapabilities,
    selected_skills: selectedSkills,
    selected_mcps: selectedMcps,
    unresolved_capabilities: unresolvedCapabilities,
    blockers: unique(blockers),
    decisions,
    resolved_at: input.resolved_at,
  }
}
