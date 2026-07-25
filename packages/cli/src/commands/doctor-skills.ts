import { join } from 'node:path'
import type { SkillTable } from '@pipeline-lite/kernel'
import type { DoctorProbes } from '../deps.js'
import { readSkillSources, type SkillSource } from '../skillSources.js'
import { green, yellow, red, type DoctorCheck } from './doctor-check.js'

function skillInPlace(
  entry: string,
  byToken: Map<string, SkillSource>,
  installed: ReadonlySet<string>,
): boolean {
  for (const raw of entry.split('|')) {
    const alternative = raw.trim()
    if (alternative === '') continue
    const source = byToken.get(alternative)
    if (source && (source.tool === 'builtin' || source.tool === 'bundled')) return true
    if (installed.has(alternative)) return true
    if (source?.skill !== undefined && installed.has(source.skill)) return true
    const colon = alternative.indexOf(':')
    if (colon <= 0) continue
    const prefix = alternative.slice(0, colon)
    const suffix = alternative.slice(colon + 1)
    if (installed.has(prefix) || installed.has(suffix)) return true
    const pluginSkill = byToken.get(prefix)?.skill
    if (pluginSkill !== undefined && installed.has(pluginSkill)) return true
  }
  return false
}

function collectMissingSkills(
  table: SkillTable,
  byToken: Map<string, SkillSource>,
  installed: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>()
  const missing: string[] = []
  for (const row of Object.values(table)) {
    for (const list of Object.values(row)) {
      for (const entry of list ?? []) {
        if (seen.has(entry)) continue
        seen.add(entry)
        if (!skillInPlace(entry, byToken, installed)) missing.push(entry)
      }
    }
  }
  return missing
}

export function checkSkills(p: DoctorProbes): [DoctorCheck, DoctorCheck] {
  const tables = p.manifestSkills()
  if (tables === null) {
    return [
      yellow(
        'skills:mandatory',
        'manifest 不可用——无法核强制技能齐全度（不误报 green）',
        '先修复 asset:manifest（templates/manifest.yaml）后重跑 pipeline doctor',
      ),
      yellow(
        'skills:recommended',
        'manifest 不可用——无法核推荐技能齐全度',
        '先修复 asset:manifest 后重跑 pipeline doctor',
      ),
    ]
  }
  const registryPath = join(p.pluginRoot, 'templates', 'skill-sources.yaml')
  const registry = p.fileExists(registryPath) ? readSkillSources() : []
  if (registry.length === 0) {
    return [
      yellow(
        'skills:mandatory',
        'registry 未就绪（templates/skill-sources.yaml 缺失/空）——无法核强制技能齐全度（不误报 green）',
        '确认插件安装完整（skill-sources.yaml 应随插件分发）后重跑 pipeline doctor',
      ),
      yellow(
        'skills:recommended',
        'registry 未就绪（templates/skill-sources.yaml 缺失/空）——无法核推荐技能齐全度',
        '确认插件安装完整后重跑 pipeline doctor',
      ),
    ]
  }

  const byToken = new Map(registry.map((source) => [source.token, source]))
  const installed = p.installedSkillNames()
  const mandatoryMissing = collectMissingSkills(tables.mandatory, byToken, installed)
  const recommendedMissing = collectMissingSkills(tables.recommended, byToken, installed)
  const mandatory = mandatoryMissing.length === 0
    ? green('skills:mandatory', '所有 manifest 强制技能均随当前 pipeline 插件打包并可用')
    : red(
        'skills:mandatory',
        `自定义 workflow 缺 ${mandatoryMissing.length} 个非打包强制技能：${mandatoryMissing.join('、')}`,
        `安装或随自定义插件打包这些技能（${mandatoryMissing.join('、')}）；pipeline setup --<host> 只安装本插件默认流程资产`,
      )
  const recommended = recommendedMissing.length === 0
    ? green('skills:recommended', '所有 manifest 推荐技能均随当前 pipeline 插件打包并可用')
    : yellow(
        'skills:recommended',
        `自定义 workflow 缺 ${recommendedMissing.length} 个非打包推荐技能：${recommendedMissing.join('、')}`,
        '安装或随自定义插件打包这些推荐技能（默认 pipeline 不会下载第三方技能）',
      )
  return [mandatory, recommended]
}

const CODEX_PROJECT_CONTRACT_SKILLS = [
  'pipeline',
  'pipeline-open',
  'pipeline-explore',
  'pipeline-spec',
  'pipeline-build',
  'pipeline-verify',
  'pipeline-ship',
  'pipeline-archive',
  'openspec-propose',
  'openspec-explore',
  'openspec-apply-change',
  'openspec-archive-change',
  'brainstorming',
  'grill-with-docs',
  'improve-codebase-architecture',
  'writing-plans',
  'test-driven-development',
  'verification-before-completion',
  'finishing-a-development-branch',
  'browser-qa',
  'e2e-testing',
] as const

export function checkCodexProjectSkills(p: DoctorProbes): DoctorCheck {
  if (p.codexProjectSkillNames === undefined) {
    return yellow(
      'integration:codex-project-skills',
      '未装配 Codex skill 探针——无法证明 normal-chat router 的包内 skill 可调用（不以 cache 假装 green）',
      '使用包含该探针的 pipeline CLI，或运行 pipeline setup --codex 后重试',
    )
  }
  const installed = p.codexProjectSkillNames()
  const missing = CODEX_PROJECT_CONTRACT_SKILLS.filter((name) => !installed.has(name))
  if (missing.length === 0) {
    return green(
      'integration:codex-project-skills',
      'Codex 可发现 pipeline/OpenSpec/设计/验证 contract skills 全部来自当前插件（normal-chat 可实际调用）',
    )
  }
  return yellow(
    'integration:codex-project-skills',
    `Codex 可发现的 pipeline skills 缺 ${missing.length} 个：${missing.join('、')}（全局 cache 不算）`,
    '运行 pipeline setup --codex 重新安装并校验完整插件；若使用非原生 adapter，再加 --target <项目目录>',
  )
}
