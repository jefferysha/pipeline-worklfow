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
import { isSkillUnlocked, loadWorkflow, resolveStep, resolveWorkflowName } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { str } from '../render.js'
import { reconcileCodexSkillEvidence } from '../codexSkillReceipt.js'

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

/** hooks/skill-tracker.sh 落的 skill 完成记录有两种可信宿主形态：Claude 的
 * "Skill: <skill-id>" 与 Codex 对当前插件已打包 SKILL.md 的受控读取
 * "CodexSkillRead: <skill-id>"。二者都由同一 hook 写入，且后者已通过
 * skill-evidence.sh 限制为插件根内实际存在的 skill；因此它们都可以满足 DAG 依赖。
 * Agent/Task 等其它 tool kind 仍不属于 skill DAG 命名空间，不能误算为已完成。 */
function skillIdFromToolRaw(raw: string): string | null {
  const m = /^(?:Skill|CodexSkillRead): (.+)$/.exec(raw)
  return m?.[1] ?? null
}

/** Pipeline-owned skills are presented by Codex as `pipeline-lite:<id>`, while workflow YAML and
 * immutable cache receipts use their bare id. Canonicalize this one plugin namespace before DAG
 * membership and prior-completion comparisons; leave third-party namespaces intact so custom
 * workflows can still model them explicitly. */
function canonicalPipelineLiteSkillId(skillId: string): string {
  return skillId.startsWith('pipeline-lite:') ? skillId.slice('pipeline-lite:'.length) : skillId
}

/** `pipeline` is the normal-chat orchestration entrypoint, not a phase work item.  Every custom
 * workflow reaches it before the selected step's own DAG can run, so enforcing per-step membership
 * here would prevent the workflow from starting. Keep this allowlist deliberately exact: phase
 * skills such as `pipeline-open` remain subject to the declared DAG. */
function isPipelineOrchestratorSkill(skillId: string): boolean {
  return canonicalPipelineLiteSkillId(skillId) === 'pipeline'
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
    if (id) completed.add(canonicalPipelineLiteSkillId(id))
  }
  return completed
}

export async function cmdInternalSkillGate(deps: CliDeps, name: string, skillId: string): Promise<number> {
  try {
    if (!isValidChangeName(name)) {
      deps.io.err(`WARN: internal-skill-gate 收到非法 change 名 '${name}'，fail-open 放行`)
      return 0
    }
    if (isPipelineOrchestratorSkill(skillId)) return 0
    const canonicalSkillId = canonicalPipelineLiteSkillId(skillId)

    const dir = changeDir(deps.cwd, name)
    // Reconciliation is deliberately synchronous and under the same change lock as this DAG
    // read.  A Codex PreToolUse receipt still has no effect unless the host transcript proves the
    // matching exec call completed; after that proof is appended, this invocation immediately sees
    // it instead of requiring an unreliable PostToolUse callback or a second user turn.
    return await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir)
      // 双轨分岔同 transition.ts（Task 8）：'' 历史遗留兜 'default' 的 `||` 习语单源在 kernel
      // resolveWorkflowName（Wave 2 下沉；`??` 只挡 null/undefined、不挡空串的语义原样继承）。
      const workflowName = resolveWorkflowName(state)
      if (workflowName === 'default') return 0 // default workflow 不受本机制管辖

      const wf = loadWorkflow(deps.cwd, workflowName)
      if (!wf) {
        deps.io.err(`WARN: workflow '${workflowName}' 未找到，fail-open 放行`)
        return 0
      }

      const currentStepId = str(state.fields.phase)
      const step = resolveStep(wf, currentStepId)
      if (!step) {
        deps.io.err(`WARN: step '${currentStepId}' 不在 workflow '${workflowName}' 里，fail-open 放行`)
        return 0
      }

      await reconcileCodexSkillEvidence({
        repoRoot: deps.cwd,
        changeDir: dir,
        // A missing Codex PostToolUse callback must not force a user retry: reconcile every
        // declared node in this exact step before checking the next node's dependencies.  The
        // transcript bridge remains bounded to trusted plugin paths and this physical project.
        candidateSkillIds: step.skills.map((ref) => canonicalPipelineLiteSkillId(ref.id)),
        recordedAt: deps.clock(),
        history: deps.history,
        evidenceScope: currentStepId,
      })

      // step 声明了 skills: []（未声明任何 skill）时的"视为不使用 DAG，任意 skillId 放行"这条
      // opt-in 语义现在是 isSkillUnlocked 自己契约的一部分（见该函数上方注释），本层不再需要
      // 重复这条判断——统一交给下面的 isSkillUnlocked 调用处理，避免同一条契约在两处漂移。
      const historyRaw = (await deps.readHistoryRaw?.(dir)) ?? ''
      const lines = parseHistoryLines(historyRaw)
      const completedSinceEntry = completedSkillsSinceStepEntry(lines, currentStepId)
      // Workflow YAML may retain the historical `pipeline-lite:<id>` spelling while Codex uses
      // its namespace at invocation time and cache receipts use bare ids. Normalize only our own
      // namespace, including dependencies, before delegating to the single kernel DAG predicate.
      const canonicalStepSkills = step.skills.map((ref) => ({
        ...ref,
        id: canonicalPipelineLiteSkillId(ref.id),
        depends_on: ref.depends_on?.map(canonicalPipelineLiteSkillId),
      }))

      if (isSkillUnlocked(canonicalSkillId, canonicalStepSkills, completedSinceEntry)) return 0

      // 判定为锁定：区分"根本没声明这个 skill"和"声明了但依赖没完成"两种情形，给出更具体的指引。
      const ref = canonicalStepSkills.find((s) => s.id === canonicalSkillId)
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
    })
  } catch (e) {
    deps.io.err(`WARN: internal-skill-gate 内部异常，fail-open 放行: ${errMsg(e)}`)
    return 0
  }
}
