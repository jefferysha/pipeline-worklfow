/**
 * loops 治理跨项目聚合读（新增，server 零新依赖）——kernel 的 loadRegistry/computeReadiness/
 * computeBudgetStatus 都是单 repoRoot 的，这里对机器级注册的每个项目各跑一遍再拼一份
 * dashboard 用的扁平行列表。LoopEntry.id 只在单项目内唯一，聚合后用 root 字段消歧
 * （不假设跨项目全局唯一，不做 id 改写）。
 */
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computeBudgetStatus,
  computeReadiness,
  loadRegistry,
  LOOPS_SCHEMA,
  parseLoopsYaml,
  updateLoopInYaml,
  validateSchema,
  type AutonomyLevel,
  type BudgetStatus,
  type LoopBudget,
  type LoopRisk,
  type ReadinessScore,
} from '@pipeline-lite/kernel'

export interface LoopRow {
  root: string
  id: string
  name: string
  autonomy_level: AutonomyLevel
  status: string
  // ── v5 T16：编排页「自动运行」卡的编辑面回显——T3 扩进 schema 的 allowlist/denylist 与
  //    其余可 patch 字段（kernel loops/update.ts 全集）逐一透出，滑杆/紧凑行/chips 的初值
  //    都从这里来（T3 登记过「存储侧已就绪、快照未透出」，本处即闭合）──
  cadence: string
  goal: string
  design_doc: string
  change_prefix: string | null
  risk: LoopRisk
  runner: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
  /** 原始预算声明（loops.yaml budget 块原值，滑杆初值）；区别于下面 budget=computeBudgetStatus 的计算结果。 */
  budget_decl: LoopBudget
  readiness: ReadinessScore
  budget: BudgetStatus
}

export interface LoopsSnapshot {
  generated_at: string
  rows: LoopRow[]
}

export interface LoopsSnapshotDeps {
  registry: () => string[]
  now: () => Date
}

function readRunLogText(root: string): string | null {
  try {
    return readFileSync(join(root, '.superpowers', 'loops', 'progress.md'), 'utf8')
  } catch {
    return null
  }
}

/** POST /api/loops/update 的写回结果（ok:false 一律 400 语义；error 首因 + errors 定位明细）。 */
export type LoopsUpdateResult =
  | { ok: true }
  | { ok: false; error: string; errors?: string[] }

/**
 * POST /api/loops/update 的写回逻辑（v5 T3 / 决议 #3 #12 存储侧）：
 * kernel updateLoopInYaml 文本手术（只 patch 已存在 loop 的标量/字符串数组字段；autonomy_level
 * 不收，升降档只走 /api/loops/level）。落盘前双门：
 *   ① 写回文本整文档重校验（parseLoopsYaml + validateSchema(LOOPS_SCHEMA)）——手术只保证行级
 *      形状，值域（cadence pattern / risk enum / budget minimum …）在这里兜住，失败不落盘；
 *   ② 读-判-写 CAS（对齐 afk.ts::retryAfkRun 的 CAS 先例，介质从 StateStore 字段换成文件原文）：
 *      写前重读比对首读原文，不一致说明校验 await 间隙有并发写（另一请求 / applyLevelChange /
 *      人工编辑），如实拒绝，不盲写覆盖别人的改动。
 */
export async function applyLoopsUpdate(root: string, id: string, patch: Record<string, unknown>): Promise<LoopsUpdateResult> {
  const yamlPath = join(root, '.pipeline', 'loops.yaml')
  let before: string
  try {
    before = await readFile(yamlPath, 'utf8')
  } catch {
    return { ok: false, error: `loops.yaml 未找到于 ${yamlPath}` }
  }

  const { text, error } = updateLoopInYaml(before, id, patch)
  if (error !== null || text === null) {
    return { ok: false, error: error ?? 'loops.yaml 文本手术失败' }
  }

  // ① 整文档重校验：手术后的文本必须仍是合法登记表，否则不落盘
  const parsed = parseLoopsYaml(text)
  if (parsed.error !== null || parsed.data === null || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return { ok: false, error: `写回文本解析失败：${parsed.error ?? '顶层非 mapping'}` }
  }
  const schemaErrors = validateSchema(parsed.data, LOOPS_SCHEMA)
  if (schemaErrors.length > 0) {
    return { ok: false, error: 'patch 后 schema 校验失败，未落盘', errors: schemaErrors }
  }

  // ② 读-判-写 CAS（afk retry 先例）：比对期间无 await，比对通过即写
  let current: string
  try {
    current = await readFile(yamlPath, 'utf8')
  } catch {
    return { ok: false, error: 'CAS 失败，loops.yaml 在此期间被删除' }
  }
  if (current !== before) {
    return { ok: false, error: 'CAS 失败，loops.yaml 在此期间被并发修改' }
  }
  await writeFile(yamlPath, text, 'utf8')
  return { ok: true }
}

export async function buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot> {
  const now = deps.now()
  const rows: LoopRow[] = []
  for (const root of deps.registry()) {
    const { data } = loadRegistry(root)
    if (!data) continue
    const runLogText = readRunLogText(root)
    for (const loop of data.loops) {
      rows.push({
        root,
        id: loop.id,
        name: loop.name,
        autonomy_level: loop.autonomy_level,
        status: loop.status,
        cadence: loop.cadence,
        goal: loop.goal,
        design_doc: loop.design_doc,
        change_prefix: loop.change_prefix,
        risk: loop.risk,
        runner: loop.runner,
        human_gates: loop.human_gates,
        kill_criteria: loop.kill_criteria,
        allowlist: loop.allowlist,
        denylist: loop.denylist,
        budget_decl: loop.budget,
        readiness: computeReadiness(loop),
        budget: computeBudgetStatus(loop, runLogText, now),
      })
    }
  }
  return { generated_at: now.toISOString(), rows }
}
