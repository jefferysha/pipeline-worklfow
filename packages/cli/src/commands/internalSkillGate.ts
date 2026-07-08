/**
 * pipeline internal-skill-gate <name> <skillId> —— 隐藏命令，非 default workflow 的 skill DAG
 * 解锁判定，从 hooks/gate.sh 委托过来（GOAL 清单 E Task 9）。
 *
 * workflow==='default' 的 change 完全不受本机制管辖，直接放行——gate.sh 只在自己判定"非
 * default workflow + Skill 工具调用"时才 spawn node 走到这里；本命令内部再兜底判一次同样的
 * 条件（双重防线：即便未来 gate.sh 的调用条件写错，也不会误伤 default workflow 的 change）。
 *
 * exit 口径（同 gate.sh 契约）：0=放行，2=拦截。本命令绝不让 0/2 之外的 code 泄漏出去——任何
 * 内部异常（state 读不到 / workflow 文件损坏 / history 行损坏等）一律 catch 到顶层，WARN +
 * fail-open 放行，呼应 hooks/gate.sh 文件头总纲："fail-open（绝不死锁）：... 任何异常 → 放行
 * exit 0"——这条硬承诺对本命令同样成立，不因为判定逻辑挪进了 CLI 就打折扣。
 */
import { isSkillUnlocked, loadWorkflow } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { str } from '../render.js'

interface HistLine {
  readonly kind: string
  readonly to?: string
  readonly raw?: string
}

/** 容错解析 .pipeline-history.jsonl 原文——单行损坏不该拖垮整条 gate 判定，跳过即可（fail-open 精神）。 */
function parseHistoryLines(raw: string): HistLine[] {
  const out: HistLine[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      out.push(JSON.parse(line) as HistLine)
    } catch {
      // 损坏行跳过，不拖垮整体判定
    }
  }
  return out
}

/** hooks/skill-tracker.sh 落的 tool 记录 raw 形如 "Skill: <skill-id>"（$TOOL: $NAME，见该文件
 *  第 97 行）——本函数只认 "Skill: " 前缀，Agent/Task 等其它 tool kind 与 skill DAG 无关（不同
 *  命名空间，不会出现在任何 SkillRef.id / depends_on 里，天然不匹配，无需额外排除）。 */
function skillIdFromToolRaw(raw: string): string | null {
  const m = /^Skill: (.+)$/.exec(raw)
  return m ? m[1]! : null
}

/**
 * 找最近一次进入 currentStepId 的 transition 记录，只统计其后的 skill 完成记录——同一 step
 * 可能被回环重新进入多次（自定义 workflow 允许任意 event 图，不像 default workflow 只有
 * build⇄verify 这一条回边），只有"这一次"进入之后的完成记录才该算数，否则上一轮的旧完成
 * 记录会让重新进入的 step 误判为"已解锁"。
 *
 * 复用 workflow-skill-orchestration.integration.test.ts 的 index-based 分段扫描写法（先定位
 * 分段起点索引，再 slice 之后的区间），只是这里要找"最近一次"（倒序扫描取第一个命中）而非
 * 该测试里固定线性顺序的"第一次"（正序 findIndex）——需求不同，扫描 shape 相同。
 */
function completedSkillsSinceStepEntry(lines: readonly HistLine[], currentStepId: string): ReadonlySet<string> {
  let enteredAt = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.kind === 'transition' && lines[i]?.to === currentStepId) {
      enteredAt = i
      break
    }
  }
  const completed = new Set<string>()
  for (const line of lines.slice(enteredAt + 1)) {
    if (line.kind !== 'tool') continue
    const id = skillIdFromToolRaw(line.raw ?? '')
    if (id) completed.add(id)
  }
  return completed
}

export async function cmdInternalSkillGate(deps: CliDeps, name: string, skillId: string): Promise<number> {
  try {
    if (!isValidChangeName(name)) {
      deps.io.err(`WARN: internal-skill-gate 收到非法 change 名 '${name}'，fail-open 放行`)
      return 0
    }

    const dir = changeDir(deps.cwd, name)
    const state = await deps.store.read(dir)
    // 双轨分岔同 transition.ts（Task 8）：'' 是历史遗留非自定义名，用 `||` 兜空串
    // （`??` 只挡 null/undefined、不挡空串——mockState/真实 legacy 状态文件都可能踩这个坑）。
    const workflowName = str(state.fields.workflow) || 'default'
    if (workflowName === 'default') return 0 // default workflow 不受本机制管辖

    const wf = loadWorkflow(deps.cwd, workflowName)
    if (!wf) {
      deps.io.err(`WARN: workflow '${workflowName}' 未找到，fail-open 放行`)
      return 0
    }

    const currentStepId = str(state.fields.phase)
    const step = wf.steps.find((s) => s.id === currentStepId)
    if (!step) {
      deps.io.err(`WARN: step '${currentStepId}' 不在 workflow '${workflowName}' 里，fail-open 放行`)
      return 0
    }

    // step 没声明任何 skill（skills: []）：视为该 step 不使用 DAG 这个能力（opt-in 语义），
    // 不受本机制管辖，直接放行。isSkillUnlocked 对"未声明的 skill id"统一判定为锁定（Task 6
    // 的 allowlist 语义，供"声明了 skills 但这个不在列表里"的场景使用）——但空列表不该被读成
    // "锁死这个 step 的一切 skill 调用"，那会让"不想为某个 step 操心 DAG 顺序"的最常见写法
    // （skills: []，Task 8 两个 fixture 工作流的 s2 都这么写）意外变成完全无法用任何 skill。
    // 只有当 step 主动声明了至少一个 skill，才真正进入 isSkillUnlocked 的 allowlist 判定。
    if (step.skills.length === 0) return 0

    const historyRaw = (await deps.readHistoryRaw?.(dir)) ?? ''
    const lines = parseHistoryLines(historyRaw)
    const completedSinceEntry = completedSkillsSinceStepEntry(lines, currentStepId)

    if (isSkillUnlocked(skillId, step.skills, completedSinceEntry)) return 0

    // 判定为锁定：区分"根本没声明这个 skill"和"声明了但依赖没完成"两种情形，给出更具体的指引。
    const ref = step.skills.find((s) => s.id === skillId)
    if (!ref) {
      deps.io.err(
        `【pipeline 门】skill '${skillId}' 不在 step '${currentStepId}'（workflow '${workflowName}'）声明的 skills 列表里，暂不可用`,
      )
    } else {
      const missing = (ref.depends_on ?? []).filter((d) => !completedSinceEntry.has(d))
      deps.io.err(
        `【pipeline 门】skill '${skillId}' 在 step '${currentStepId}'（workflow '${workflowName}'）未解锁：` +
          `还需先完成 ${missing.join(', ')}（本次进入该 step 之后）`,
      )
    }
    return 2
  } catch (e) {
    deps.io.err(`WARN: internal-skill-gate 内部异常，fail-open 放行: ${errMsg(e)}`)
    return 0
  }
}
