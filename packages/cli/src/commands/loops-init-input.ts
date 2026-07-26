import {
  compileAutomationPolicyTemplate, LOOP_RUNNERS, PHASES, type AutomationPolicyTemplate,
  type LoopBudget, type LoopKind, type LoopRisk, type NewLoopEntryInput,
} from '@tenon/kernel'
import { errMsg } from '../deps.js'

// ── loop-init：`tenon loops init` 向导 + 非交互结构化通道（L3）─────────────────────
//
// 「agent 起草 → dashboard 审阅」协议的终端生产侧（计划拍板 P1/P3/P4/P5/P6）：
//   · 人在 TTY 下走三组交互问答（目标/边界/节奏），每问展示推导默认值，回车即收；
//   · agent/CI 走非交互 flags（缺 TTY 或 --yes → 全默认，必填 --id/--goal 缺失即报错）；
//   · 起草的 loop 强制 status:paused（硬 gate，无开关）——paused 在 kernel enforce 是 kill 判定，
//     scheduler 不跑；批准 = dashboard PATCH status:active，走既有 POST /api/loops/update。
//   · 登记进草稿标记 sidecar（best-effort：失败只 WARN，绝不回滚已落盘的 loop，对齐 init.ts 铁律）。
// fs + CAS 由本命令负责（kernel 文本原语是纯函数 text-in/text-out），对齐 server applyLoopsUpdate
// 读-判-写先例；kernel 原语：createLoopsYamlText / appendLoopToYamlText / draftMarksPath / addDraftMark。

/** 推导规则表常量（唯一口径——计划 L3 推导规则表逐字段照落，单测钉住）。 */
export const RISK_CADENCE: Record<LoopRisk, string> = { low: '4h', medium: '2h', high: '1h' }
const RISK_MAX_RUNS: Record<LoopRisk, number> = { low: 48, medium: 24, high: 8 }
export const DEFAULT_KILL_CRITERIA = ['no-change-3', 'budget-burn-2d'] as const
/** 复核门阶段默认——**镜像** dashboard `types.ts:50 REVIEW_PHASES`（explore/spec/verify）。
 * kernel 无此单源（PHASES 是全量七阶段，非复核门子集），故此处镜像并登记来源，对齐
 * server/loops.ts::listMatchedChanges 的镜像先例（不跨包 import dashboard，注释锚定真相源）。 */
export const DEFAULT_HUMAN_GATES = ['explore', 'spec', 'verify'] as const
const DEFAULT_MAX_TOKENS_PER_DAY = 100000
/** id 正则（镜像 LOOPS_SCHEMA loops.items.id pattern；交互态就地重问、非交互态 exit 1）。 */
const INIT_ID_RE = /^[a-z][a-z0-9-]*$/
/** cadence 正则（镜像 LOOPS_SCHEMA cadence pattern）。 */
const INIT_CADENCE_RE = /^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$/
/** goal 最短长度（镜像 LOOPS_SCHEMA goal minLength）。 */
const GOAL_MIN_LEN = 10

/** change_prefix 推导：id 按 `-` 分段取每段首字母 + `-`（如 `restyle-loop`→`rl-`）。 */
export function derivePrefix(id: string): string {
  const initials = id.split('-').filter((s) => s.length > 0).map((s) => s[0]).join('')
  return `${initials}-`
}

export function validateId(s: string): string | null {
  return INIT_ID_RE.test(s) ? null : `id 非法「${s}」：须匹配 ${INIT_ID_RE.source}（小写字母开头，仅小写字母/数字/连字符）`
}
export function validateGoal(s: string): string | null {
  return s.length >= GOAL_MIN_LEN ? null : `goal 过短（当前 ${s.length} 字符）：须 ≥${GOAL_MIN_LEN} 字符`
}
export function validateCadence(s: string): string | null {
  return INIT_CADENCE_RE.test(s) ? null : `cadence 非法「${s}」：须匹配 ${INIT_CADENCE_RE.source}（如 4h / 30m / 1h-2h / continuous）`
}
export function validateRisk(s: string): string | null {
  return (['low', 'medium', 'high'] as string[]).includes(s) ? null : `risk 非法「${s}」：须为 low|medium|high`
}
export function validateKind(s: string): string | null {
  return (['orchestrator', 'executor'] as string[]).includes(s) ? null : `kind 非法「${s}」：须为 orchestrator|executor`
}
export function validateRunner(s: string): string | null {
  return (LOOP_RUNNERS as readonly string[]).includes(s)
    ? null
    : `runner 非法「${s}」：须为 ${LOOP_RUNNERS.join('|')}；未知值不会降级到其他 runner`
}

/** CSV → 去空白去空项的字符串数组。 */
export function csv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

// ── flags 自解析（独立于既有 parseArgs——init 的 flags 面与 --json/--loop 不同）──────────
export interface InitArgs {
  yes: boolean
  json: boolean
  error?: string
  id?: string
  name?: string
  goal?: string
  template?: string
  workflow?: string
  skillBundle?: string
  kind?: string
  prefix?: string
  risk?: string
  runner?: string
  cadence?: string
  phases?: string[]
  gates?: string[]
  kill?: string[]
  doc?: string
}

export function parseInitArgs(args: string[]): InitArgs {
  const out: InitArgs = { yes: false, json: false }
  const valueAfter = (index: number, flag: string): string | undefined => {
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      out.error = `${flag} 缺少值`
      return undefined
    }
    return value
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === undefined) continue
    switch (a) {
      case '--yes': out.yes = true; break
      case '--json': out.json = true; break
      case '--id': out.id = valueAfter(i, a); i++; break
      case '--name': out.name = valueAfter(i, a); i++; break
      case '--goal': out.goal = valueAfter(i, a); i++; break
      case '--template': out.template = valueAfter(i, a); i++; break
      case '--workflow': out.workflow = valueAfter(i, a); i++; break
      case '--skill-bundle': out.skillBundle = valueAfter(i, a); i++; break
      case '--kind': out.kind = valueAfter(i, a); i++; break
      case '--prefix': out.prefix = valueAfter(i, a); i++; break
      case '--risk': out.risk = valueAfter(i, a); i++; break
      case '--runner': {
        const runner = valueAfter(i, a)
        if (runner !== undefined) {
          const error = validateRunner(runner)
          if (error === null) out.runner = runner
          else out.error = error
        }
        i++
        break
      }
      case '--cadence': out.cadence = valueAfter(i, a); i++; break
      case '--phases': out.phases = csv(valueAfter(i, a) ?? ''); i++; break
      case '--gates': out.gates = csv(valueAfter(i, a) ?? ''); i++; break
      case '--kill': out.kill = csv(valueAfter(i, a) ?? ''); i++; break
      case '--doc': out.doc = valueAfter(i, a); i++; break
      default: out.error = `未知 loops init 参数「${a}」`; break
    }
    if (out.error !== undefined) break
  }
  return out
}

export interface StarterCompilation {
  readonly policy: AutomationPolicyTemplate | null
  readonly compileError: string | null
  readonly templateId: string
  readonly templateVersion: 1
  readonly workflowId: string
  readonly skillBundleId: string | null
}

export function compileStarter(flags: InitArgs): StarterCompilation | null {
  if (flags.template === undefined) return null
  const override: Record<string, unknown> = {}
  if (flags.goal !== undefined) override.goal = flags.goal
  if (flags.risk !== undefined) override.risk = flags.risk
  try {
    const policy = compileAutomationPolicyTemplate(flags.template, override, 1)
    return {
      policy,
      compileError: null,
      templateId: policy.id,
      templateVersion: policy.version,
      workflowId: flags.workflow ?? policy.recommendedWorkflow,
      // H3 推荐项是具体 skill 列表，不能冒充 H10 的 profile id；未显式绑定即如实持久化 null=unwired。
      skillBundleId: flags.skillBundle ?? null,
    }
  } catch (error) {
    return {
      policy: null,
      compileError: errMsg(error),
      templateId: flags.template,
      templateVersion: 1,
      // catalog 未解析时不声称拿到了推荐；default 只是持久 binding 占位，helper 会先判 template invalid。
      workflowId: flags.workflow ?? 'default',
      skillBundleId: flags.skillBundle ?? null,
    }
  }
}

/** 全字段已解析的向导/非交互产物（默认值已就位）。 */
export interface RawInputs {
  id: string
  name: string
  goal: string
  workflowId?: string
  skillBundleId?: string
  designDoc: string
  prefix: string | null // null = 显式 none / 无前缀
  kind: string
  runner: string
  gates: string[]
  kill: string[]
  risk: string
  cadence: string
  phases: string[]
}

/** 非交互：flags → RawInputs（应用推导规则表默认值）；缺必填 → missing 列表非空。 */
export function resolveDefaults(flags: InitArgs): { raw: RawInputs | null; missing: string[] } {
  const missing: string[] = []
  const id = flags.id
  const goal = flags.goal
  if (id === undefined) missing.push('--id')
  if (goal === undefined) missing.push('--goal')
  if (missing.length > 0) return { raw: null, missing }
  if (id === undefined || goal === undefined) return { raw: null, missing: ['--id', '--goal'] }
  const risk = flags.risk ?? 'low'
  const raw: RawInputs = {
    id,
    name: flags.name ?? id,
    goal,
    workflowId: flags.workflow,
    skillBundleId: flags.skillBundle,
    designDoc: flags.doc ?? `docs/loops/${id}.md`,
    prefix: flags.prefix === undefined ? derivePrefix(id) : flags.prefix === 'none' ? null : flags.prefix,
    kind: flags.kind ?? 'orchestrator',
    runner: flags.runner ?? 'codex',
    gates: flags.gates ?? [...DEFAULT_HUMAN_GATES],
    kill: flags.kill ?? [...DEFAULT_KILL_CRITERIA],
    risk,
    cadence: flags.cadence ?? RISK_CADENCE[risk as LoopRisk] ?? RISK_CADENCE.low,
    phases: flags.phases ?? [...PHASES],
  }
  return { raw, missing: [] }
}

/** RawInputs → NewLoopEntryInput（budget 按 risk 推导；status 恒 paused）；字段校验不过 → error。 */
export function assembleEntry(
  raw: RawInputs,
  starter: StarterCompilation | null = null,
): { entry: NewLoopEntryInput | null; error: string | null } {
  for (const check of [validateId(raw.id), validateGoal(raw.goal), validateKind(raw.kind), validateRunner(raw.runner), validateRisk(raw.risk), validateCadence(raw.cadence)]) {
    if (check !== null) return { entry: null, error: check }
  }
  const risk = raw.risk as LoopRisk
  const budget: LoopBudget = {
    max_runs_per_day: RISK_MAX_RUNS[risk],
    max_in_flight: 1,
    on_exceed: 'skip',
    max_tokens_per_day: DEFAULT_MAX_TOKENS_PER_DAY,
  }
  const workflowId = raw.workflowId ?? starter?.workflowId
  const entry: NewLoopEntryInput = {
    id: raw.id,
    name: raw.name,
    kind: raw.kind as LoopKind,
    goal: raw.goal,
    cadence: raw.cadence,
    risk,
    runner: raw.runner,
    change_prefix: raw.prefix,
    phases: raw.phases,
    human_gates: raw.gates,
    design_doc: raw.designDoc,
    status: 'paused', // 协议约定：硬 gate，无开关（拍板 P1）
    budget,
    kill_criteria: raw.kill,
    ...(starter === null ? {} : {
      template_id: starter.templateId,
      template_version: starter.templateVersion,
    }),
    ...(workflowId === undefined
      ? {}
      : { workflow_id: workflowId }),
    ...(starter === null && raw.skillBundleId === undefined
      ? {}
      : { skill_bundle_id: raw.skillBundleId ?? starter?.skillBundleId ?? null }),
  }
  return { entry, error: null }
}
