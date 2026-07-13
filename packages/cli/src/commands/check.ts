/**
 * check <name> —— guard 报告（人读）；exit 0 过 / 2 不过 / 1 错误（CONTRACT §3）。
 * 检查项内容是 flow.guardCheck（kernel/flow 相位出口全量规则表，BACKLOG #12）的职责，cli 只渲染：
 * deps.guardCtx（main.ts 用 node:fs 落地）注入文件面 → 老 guard 全语义；未注入 = lite 纯字段面。
 * warnings（老 guard yellow 提示面：coverage 豁免/阻塞层明细）渲染为 [WARN] 行，不影响 exit。
 *
 * 双轨（对齐 transition.ts 的 default vs 自定义 workflow 分岔）：读完 state 立刻按 workflow 字段分流。
 * default（含历史遗留空串，故 `|| 'default'` 兜空串，不是 `??`）→ 上面的 guardCheck 路径逐字不变；
 * 非 default → 读该 workflow 当前 step 定义、按 step-guard 评估（evaluateStepGuards）。check 是纯预览：
 * 两条路径都绝不写盘。exit 语义统一：过 0 / guard 不过 2 / 配置错（workflow 缺失·非法、step 不在图）1。
 */
import { evaluateStepGuards, loadWorkflow } from '@pipeline-lite/kernel'
import type { PipelineState } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { display, str } from '../render.js'

export async function cmdCheck(deps: CliDeps, name: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  let state
  try {
    state = await deps.store.read(dir)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }

  const workflowName = str(state.fields.workflow) || 'default'
  if (workflowName !== 'default') {
    return checkCustomWorkflow(deps, name, dir, state, workflowName)
  }

  // ── default workflow：逐字保持原有 guardCheck 路径（零回归）──
  const result = deps.flow.guardCheck(state, deps.guardCtx?.(name))
  deps.io.out(`[CHECK] ${name} (phase=${display(state.fields.phase)})`)
  for (const warning of result.warnings ?? []) {
    deps.io.out(`  [WARN] ${warning}`)
  }
  if (result.pass) {
    deps.io.out('  [PASS] 所有检查通过')
    return 0
  }
  for (const failure of result.failures) {
    deps.io.out(`  [FAIL] ${failure}`)
  }
  deps.io.out(`  [FAIL] 共 ${result.failures.length} 项未通过`)
  return 2
}

/**
 * 非 default workflow 的 check：加载该 workflow、定位当前 step、按其 step-guard 预览评估
 * （evaluateStepGuards——同 transition.ts 求值「正在退出的」当前 step 的 guard，单一真相源）。
 * 纯预览、零写盘。exit：guard 全过 0 / guard 不过 2（与 default 不过同码）/ 配置错 1。
 */
function checkCustomWorkflow(
  deps: CliDeps,
  name: string,
  dir: string,
  state: PipelineState,
  workflowName: string,
): number {
  let wf
  try {
    // loadWorkflow 对非法 workflow 文件 fail-loud 抛错（解析/校验），捕获后转成 exit 1 配置错。
    wf = loadWorkflow(deps.cwd, workflowName)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  if (!wf) {
    deps.io.err(`ERROR: workflow '${workflowName}' 未找到（期望 .pipeline/workflows/${workflowName}.yaml）`)
    return 1
  }
  const currentStepId = str(state.fields.phase)
  const step = wf.steps.find((s) => s.id === currentStepId)
  if (!step) {
    deps.io.err(`ERROR: step '${currentStepId}' 不在 workflow '${workflowName}' 里`)
    return 1
  }
  const result = evaluateStepGuards(state, step, { changeDirAbs: dir })
  deps.io.out(`[CHECK] ${name} (phase=${display(state.fields.phase)})`)
  if (result.pass) {
    deps.io.out('  [PASS] 所有检查通过')
    return 0
  }
  for (const failure of result.failures) {
    deps.io.out(`  [FAIL] ${failure}`)
  }
  deps.io.out(`  [FAIL] 共 ${result.failures.length} 项未通过`)
  return 2
}
