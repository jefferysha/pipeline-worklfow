/**
 * guardCheck lite 子集 —— 每相位「出口」必填字段表。
 *
 * 蒸馏来源（老仓 workflow-plugin，严格只读）：
 *   · skills/pipeline/scripts/pipeline-guard.sh 的 phase case 块 +
 *     skills/pipeline/manifest.yaml phases.*.exit_checks（S4 数据化表）。
 * lite 只保留**纯字段**检查（guardCheck 签名只有 state、无文件系统访问）；
 * 文件存在性 / tasks.md 勾选 / coverage 矩阵 / mandatory skills 等 fs 依赖检查不在 lite 面内。
 *
 * 与老内核的两处有意投影（lite 化，非漂移）：
 *   · build 出口要求 build_sha 非空 —— 老内核在 build-complete 事件体内 `git rev-parse HEAD`
 *     自动冻结；lite 引擎纯函数、不碰 git，改为 CLI/用户先 set build_sha、guard 把关（barrier
 *     语义不变：verify 必须审冻结靶，ADR 0005）。
 *   · verify 出口要求 verify_result=pass（全 track）—— 老内核 fe/be 在 verify-pass 事件体内
 *     cmd_set verify_result pass；lite transition 只写 phase/phase_status/updated_at，
 *     verify_result 由 CLI/用户显式落，guard 统一把关（pm 轨老 manifest 本就如此检查）。
 *
 * 「null」哨兵：老内核把字符串 "null" 视同空（state-transition.sh `[ "$dd" = "null" ]`），照搬。
 */
import type { FieldName, GuardResult, Phase, PipelineState } from '../types.js'

type GuardRule =
  | { field: FieldName; kind: 'nonempty'; tracks?: readonly string[] }
  | { field: FieldName; kind: 'eq'; value: string; tracks?: readonly string[] }

/** 相位出口必填字段表（顺序 = 报告顺序，对齐老 guard 声明顺序） */
const EXIT_RULES: Readonly<Record<Phase, readonly GuardRule[]>> = {
  // open 出口：老 guard 全是文件检查（proposal.md/tasks.md/design.md），lite 无字段项
  open: [],
  // explore 出口：design_doc 字段非空（文件存在性检查落 CLI/后续，不在 lite 面）
  explore: [{ field: 'design_doc', kind: 'nonempty' }],
  // spec 出口：plan 非空，仅 frontend/backend（老 manifest exit_checks tracks: "backend,frontend"；pm 豁免）
  spec: [{ field: 'plan', kind: 'nonempty', tracks: ['frontend', 'backend'] }],
  // build 出口：build_mode/isolation 已设 + build_sha 已冻结（barrier，见文件头注释）
  build: [
    { field: 'build_mode', kind: 'nonempty' },
    { field: 'isolation', kind: 'nonempty' },
    { field: 'build_sha', kind: 'nonempty' },
  ],
  // verify 出口：报告落盘 + 分支处置 + fe/be 双 review 全 pass + verify_result=pass
  verify: [
    { field: 'verification_report', kind: 'nonempty' },
    { field: 'branch_status', kind: 'eq', value: 'handled' },
    { field: 'agent_review_result', kind: 'eq', value: 'pass', tracks: ['frontend', 'backend'] },
    { field: 'codex_review_result', kind: 'eq', value: 'pass', tracks: ['frontend', 'backend'] },
    { field: 'verify_result', kind: 'eq', value: 'pass' },
  ],
  // ship 出口：pm 记 PRD 路径，fe/be 记 PR URL
  ship: [
    { field: 'prd_path', kind: 'nonempty', tracks: ['pm'] },
    { field: 'pr_url', kind: 'nonempty', tracks: ['frontend', 'backend'] },
  ],
  // archive 出口：verify_result=pass（老 guard archive case）
  archive: [{ field: 'verify_result', kind: 'eq', value: 'pass' }],
}

/** 老内核空值语义：空串与 "null" 哨兵都算空；列表字段取长度 */
function isEmpty(v: string | string[] | undefined): boolean {
  if (v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  return v === '' || v === 'null'
}

function scalar(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : ''
}

export function evaluateGuard(state: PipelineState): GuardResult {
  const phase = scalar(state.fields.phase)
  const rules = (EXIT_RULES as Record<string, readonly GuardRule[] | undefined>)[phase]
  if (!rules) {
    return { pass: false, failures: [`未知 phase '${phase}'，无法评估出口条件`] }
  }
  const track = scalar(state.fields.track)
  const failures: string[] = []
  for (const rule of rules) {
    if (rule.tracks && !rule.tracks.includes(track)) continue
    const value = state.fields[rule.field]
    if (rule.kind === 'nonempty') {
      if (isEmpty(value)) {
        failures.push(`${phase} 出口：要求 ${rule.field} 非空（当前='${scalar(value)}'）`)
      }
    } else {
      if (scalar(value) !== rule.value) {
        failures.push(`${phase} 出口：要求 ${rule.field}=${rule.value}（当前='${scalar(value)}'）`)
      }
    }
  }
  return { pass: failures.length === 0, failures }
}
