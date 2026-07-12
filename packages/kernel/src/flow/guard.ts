/**
 * guardCheck 全量校验面（BACKLOG #12）—— 相位「出口」规则引擎。
 *
 * 规则真相源（老仓 workflow-plugin，严格只读）：
 *   · skills/pipeline/scripts/pipeline-guard.sh（相位 case 块 + 显式步 + automation 闸）
 *   · skills/pipeline/scripts/pipeline-guard-lib.sh（谓词原语与 coverage 矩阵）
 *   · skills/pipeline/manifest.yaml phases.*.exit_checks（S4 数据表）
 * 逐相位 × track × preset 的完整盘点（含未移植面与理由）见同目录 GUARD-RULES.md。
 *
 * 两个运行面（GUARD-RULES §7.2）：
 *   · guardCheck(state)          —— lite 纯字段面：文件类检查静默跳过（向后兼容原 lite 子集）。
 *   · guardCheck(state, ctx)     —— 注入 GuardContext（fileExists/readFile/... 由 CLI 落地）后
 *                                   即老 guard 全语义；缺某能力则对应检查跳过。
 * skill/工具留痕类检查（mandatory skills / 三轨 review 证据）未移植——证据链（skill-tracker →
 * tools_history）在新仓尚不存在（BACKLOG #18/#21），见 GUARD-RULES §7.3。
 *
 * lite 早期两处投影已随全量移植撤销、回对齐老仓（GUARD-RULES §7.6）：
 *   · build 出口不再要求 build_sha（老仓由 build-complete 事件体冻结 SHA，
 *     新仓 transition.ts 已实现同款自动冻结——barrier 语义不变，ADR 0005）。
 *   · verify 出口 verify_result=pass 只对 pm track（老 manifest M246 tracks: pm；
 *     fe/be 由 verify-pass 事件体落 pass，新仓 transition.ts 同款）。
 *
 * 「null」哨兵：老内核把字符串 "null" 视同空（yaml_nonempty `[ "$v" != "null" ]`），照搬。
 */
import type { FieldName, GuardContext, GuardResult, Phase, PipelineState } from '../types.js'

type GuardRule =
  // ── 纯字段谓词（无 ctx 也评估；lite 原有面）──
  | { kind: 'nonempty'; field: FieldName; tracks?: readonly string[] }
  | { kind: 'eq'; field: FieldName; value: string; tracks?: readonly string[] }
  | { kind: 'automation-queued' }      // guard.sh:154-162 build 前置闸（纯字段 + ctx.automationRunner 旁路）
  | { kind: 'full-direct-override' }   // guard.sh:537-542 preset=full && build_mode=direct → direct_override=true
  // ── 文件面谓词（需 ctx 对应能力，缺则跳过）──
  | { kind: 'statefile' }                                                    // manifest: file_nonempty .pipeline.yaml
  | { kind: 'file-nonempty'; path: string; tracks?: readonly string[] }      // change 目录内产物
  | { kind: 'file-exists'; path: string }                                    // change 目录内产物
  | { kind: 'tasks-at-least'; n: number }                                    // lib:34-39 `^- \[[ x]\]` 计数
  | { kind: 'tasks-all-done' }                                               // lib:41-45 文件缺失=FAIL
  | { kind: 'field-file-exists'; field: FieldName; desc?: string; tracks?: readonly string[] } // 字段值=项目根相对路径
  | { kind: 'coverage' }                                                     // guard.sh:510-528 M1 覆盖 gate
  | { kind: 'depends-archived' }                                             // guard.sh:544-559

/** 相位出口规则表（顺序 = 老仓声明/评估顺序：automation 闸 → exit_checks → 显式步） */
const EXIT_RULES: Readonly<Record<Phase, readonly GuardRule[]>> = {
  // open 出口（manifest.yaml:146-151）
  open: [
    { kind: 'statefile' },
    { kind: 'file-nonempty', path: 'proposal.md' },
    { kind: 'file-exists', path: 'tasks.md' },
    { kind: 'tasks-at-least', n: 1 },
    { kind: 'file-nonempty', path: 'design.md', tracks: ['backend', 'frontend'] },
  ],
  // explore 出口（manifest.yaml:171-174）
  explore: [
    { kind: 'statefile' },
    { kind: 'nonempty', field: 'design_doc' },
    { kind: 'field-file-exists', field: 'design_doc' },
  ],
  // spec 出口（manifest.yaml:188-192 + guard.sh:510-528 coverage 显式步）
  spec: [
    { kind: 'statefile' },
    { kind: 'nonempty', field: 'plan', tracks: ['backend', 'frontend'] },
    { kind: 'field-file-exists', field: 'plan', tracks: ['backend', 'frontend'] },
    { kind: 'tasks-at-least', n: 3 },
    { kind: 'coverage' },
  ],
  // build 出口（guard.sh:154-162 前置闸 + manifest.yaml:218-222 + guard.sh:532-559 显式步）
  build: [
    { kind: 'automation-queued' },
    { kind: 'statefile' },
    { kind: 'tasks-all-done' },
    { kind: 'nonempty', field: 'build_mode' },
    { kind: 'nonempty', field: 'isolation' },
    { kind: 'full-direct-override' },
    { kind: 'depends-archived' },
  ],
  // verify 出口（manifest.yaml:239-247；verify_result 仅 pm——fe/be 由 verify-pass 事件体落值）
  verify: [
    { kind: 'statefile' },
    { kind: 'nonempty', field: 'verification_report' },
    { kind: 'field-file-exists', field: 'verification_report', desc: 'verification_report 文件存在' },
    { kind: 'eq', field: 'branch_status', value: 'handled' },
    { kind: 'eq', field: 'agent_review_result', value: 'pass', tracks: ['frontend', 'backend'] },
    { kind: 'eq', field: 'codex_review_result', value: 'pass', tracks: ['frontend', 'backend'] },
    { kind: 'eq', field: 'verify_result', value: 'pass', tracks: ['pm'] },
  ],
  // ship 出口（manifest.yaml:259-263）
  ship: [
    { kind: 'statefile' },
    { kind: 'nonempty', field: 'prd_path', tracks: ['pm'] },
    { kind: 'field-file-exists', field: 'prd_path', desc: 'prd_path 文件存在', tracks: ['pm'] },
    { kind: 'nonempty', field: 'pr_url', tracks: ['frontend', 'backend'] },
  ],
  // archive 出口（manifest.yaml:272-274）
  archive: [
    { kind: 'statefile' },
    { kind: 'eq', field: 'verify_result', value: 'pass' },
  ],
}

// ===== M1 全栈 Spec 覆盖矩阵（pipeline-guard-lib.sh:112-160 逐字对齐）=====

const COVERAGE_LAYERS = [
  'L1_api', 'L2_data', 'L3_rules', 'L4_state', 'L5_errors',
  'L6_security', 'L7_perf', 'L8_deps', 'L10_terms',
] as const

type Applicability = 'required' | 'optional' | 'na'

/** 每 track 每层适用性（lib:119-141）；表外 track / 表外层 = na */
const COVERAGE_APPLICABILITY: Readonly<Record<string, Readonly<Record<string, Applicability>>>> = {
  backend: {
    L1_api: 'required', L2_data: 'required', L3_rules: 'required', L4_state: 'required',
    L5_errors: 'required', L6_security: 'required', L8_deps: 'required',
    L7_perf: 'optional', L10_terms: 'optional',
  },
  frontend: {
    L4_state: 'required', L5_errors: 'required',
    L1_api: 'optional', L3_rules: 'optional', L6_security: 'optional',
    L7_perf: 'optional', L8_deps: 'optional', L10_terms: 'optional',
  },
  pm: {
    L3_rules: 'required',
    L2_data: 'optional', L4_state: 'optional', L10_terms: 'optional',
  },
}

/** 🔒 概念→层（lib:144：默认仅 auth→L6_security） */
const COVERAGE_LOCK_CONCERN: Readonly<Record<string, string>> = { L6_security: 'auth' }

/** design_doc 的 ```coverage 围栏块内容行（lib awk '/^```coverage/{f=1;next} /^```/{f=0} f'） */
function coverageBlockLines(content: string | undefined): string[] {
  if (content === undefined) return []
  const out: string[] = []
  let inBlock = false
  for (const line of content.split('\n')) {
    if (/^```coverage/.test(line)) { inBlock = true; continue }
    if (/^```/.test(line)) { inBlock = false; continue }
    if (inBlock) out.push(line)
  }
  return out
}

/** 层状态（lib:147-155）：filled|waived 之外（含缺行/坏值）一律 blank */
function coverageBlockStatus(lines: readonly string[], layer: string): 'filled' | 'waived' | 'blank' {
  const row = lines.find((l) => l.startsWith(`${layer}:`))
  if (row === undefined) return 'blank'
  const m = /^[ \t]*([a-zA-Z]+)/.exec(row.slice(layer.length + 1))
  const st = m?.[1]
  return st === 'filled' || st === 'waived' ? st : 'blank'
}

/** touches 受保护域（lib:157-160 + guard.sh:450 tr ',' ' ' 词切） */
function coverageTouches(lines: readonly string[]): string[] {
  const row = lines.find((l) => l.startsWith('touches:'))
  if (row === undefined) return []
  return row.slice('touches:'.length).split(/[,\s]+/).filter((w) => w !== '')
}

// ===== 谓词与工具 =====

/** 老内核空值语义：空串与 "null" 哨兵都算空；列表字段取长度 */
function isEmpty(v: string | string[] | undefined): boolean {
  if (v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  return v === '' || v === 'null'
}

function scalar(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : ''
}

/** depends_on 展开：数组逐项 / 老式逗号标量逐项，trim 后剔空与 "null"（guard.sh:544-549） */
function depsOf(v: string | string[] | undefined): string[] {
  const items = Array.isArray(v) ? v : (v ?? '').split(',')
  return items.map((s) => s.trim()).filter((s) => s !== '' && s !== 'null')
}

/** `^- \[[ x]\]` 任务行计数（lib:34-39；大写 X 不计，照老仓 regex）。
 *  单一真相源：workflow/stepGuard.ts 的 tasks-at-least guard 复用本函数，勿另造计数逻辑。 */
export function taskCount(content: string | undefined): number {
  if (content === undefined) return 0
  return content.split('\n').filter((l) => /^- \[[ x]\]/.test(l)).length
}

/** tracks= 过滤（guard.sh:322-331）：无 tracks 对全部生效；track 不在列表 → 跳过 */
function trackApplies(tracks: readonly string[] | undefined, track: string): boolean {
  return tracks === undefined || tracks.includes(track)
}

/** 老仓 label 的 track 后缀（guardcheck_* 有 tracks= 条件时带出当前 track） */
function trackSuffix(tracks: readonly string[] | undefined, track: string): string {
  return tracks === undefined ? '' : ` (${track} track)`
}

/** M1 覆盖 gate（guard.sh:436-477 emit_coverage_status + 510-528 spec 显式步） */
function evaluateCoverage(
  state: PipelineState,
  ctx: GuardContext,
  failures: string[],
  warnings: string[],
): void {
  if (ctx.readFile === undefined) return
  const track = scalar(state.fields.track)
  const preset = scalar(state.fields.preset)
  const dd = scalar(state.fields.design_doc)
  const content = dd !== '' && dd !== 'null' ? ctx.readFile(dd) : undefined
  const lines = coverageBlockLines(content)
  const touches = coverageTouches(lines)
  const applicability = COVERAGE_APPLICABILITY[track]

  // emit 行格式照老仓：`$layer $app $status $verdict$tag`（na 层 skip，连锁也不查——guard.sh:459）
  const blockedLines: string[] = []
  let lockViolations = 0
  for (const layer of COVERAGE_LAYERS) {
    const app = applicability?.[layer] ?? 'na'
    if (app === 'na') continue
    const status = coverageBlockStatus(lines, layer)
    const concern = COVERAGE_LOCK_CONCERN[layer]
    const locked = concern !== undefined && touches.includes(concern)
    if (locked) {
      // 🔒 锁层必须 filled，waive/blank 都违反（guard.sh:467-469）
      if (status !== 'filled') {
        blockedLines.push(`${layer} ${app} ${status} BLOCKED LOCKVIOLATION`)
        lockViolations += 1
      }
    } else if (app === 'required' && status === 'blank') {
      blockedLines.push(`${layer} ${app} ${status} BLOCKED`)
    }
  }

  // hotfix/tweak：required-blank 降级 WARN，仅 🔒 锁违反计入阻塞（guard.sh:512-524）
  const waive = preset === 'hotfix' || preset === 'tweak'
  const covBlock = waive ? lockViolations : blockedLines.length
  if (waive) {
    const warnBlank = blockedLines.length - lockViolations
    if (warnBlank > 0) {
      warnings.push(`${preset}：${warnBlank} 层覆盖留空（已豁免，建议补；🔒 锁不豁免）`)
    }
  }
  if (covBlock > 0) {
    failures.push(`spec 出口：全栈 Spec 覆盖（${covBlock} 层阻塞）`)
    for (const l of blockedLines) warnings.push(`覆盖阻塞: ${l}`)
  }
}

export function evaluateGuard(state: PipelineState, ctx?: GuardContext): GuardResult {
  const phase = scalar(state.fields.phase)
  const rules = (EXIT_RULES as Record<string, readonly GuardRule[] | undefined>)[phase]
  if (!rules) {
    return { pass: false, failures: [`未知 phase '${phase}'，无法评估出口条件`] }
  }
  const track = scalar(state.fields.track)
  const changeDir = ctx?.changeDirRel
  const failures: string[] = []
  const warnings: string[] = []

  for (const rule of rules) {
    switch (rule.kind) {
      case 'nonempty': {
        if (!trackApplies(rule.tracks, track)) break
        const value = state.fields[rule.field]
        if (isEmpty(value)) {
          failures.push(`${phase} 出口：要求 ${rule.field} 非空（当前='${scalar(value)}'）`)
        }
        break
      }
      case 'eq': {
        if (!trackApplies(rule.tracks, track)) break
        const value = state.fields[rule.field]
        if (scalar(value) !== rule.value) {
          failures.push(`${phase} 出口：要求 ${rule.field}=${rule.value}（当前='${scalar(value)}'）`)
        }
        break
      }
      case 'automation-queued': {
        // guard.sh:154-162：主线 build 路径拦截；调度器（PIPELINE_AUTOMATION_RUNNER=1）旁路
        if (ctx?.automationRunner === true) break
        if (scalar(state.fields.automation) === 'queued') {
          failures.push(
            `${phase} 出口：automation=queued 已入队调度器，主线 build 路径被拦（想手动跑先 set automation off）`,
          )
        }
        break
      }
      case 'full-direct-override': {
        if (scalar(state.fields.preset) === 'full' && scalar(state.fields.build_mode) === 'direct') {
          const ovr = scalar(state.fields.direct_override)
          if (ovr !== 'true') {
            failures.push(`${phase} 出口：full+direct 要求 direct_override=true（当前='${ovr}'）`)
          }
        }
        break
      }
      case 'statefile': {
        if (ctx?.fileNonempty === undefined || changeDir === undefined) break
        if (!ctx.fileNonempty(`${changeDir}/.pipeline.yaml`)) {
          failures.push(`${phase} 出口：要求 状态文件存在且非空（.pipeline.yaml）`)
        }
        break
      }
      case 'file-nonempty': {
        if (!trackApplies(rule.tracks, track)) break
        if (ctx?.fileNonempty === undefined || changeDir === undefined) break
        if (!ctx.fileNonempty(`${changeDir}/${rule.path}`)) {
          failures.push(`${phase} 出口：要求 ${rule.path} 存在且非空${trackSuffix(rule.tracks, track)}`)
        }
        break
      }
      case 'file-exists': {
        if (ctx?.fileExists === undefined || changeDir === undefined) break
        if (!ctx.fileExists(`${changeDir}/${rule.path}`)) {
          failures.push(`${phase} 出口：要求 ${rule.path} 存在`)
        }
        break
      }
      case 'tasks-at-least': {
        if (ctx?.readFile === undefined || changeDir === undefined) break
        const count = taskCount(ctx.readFile(`${changeDir}/tasks.md`))
        if (count < rule.n) {
          failures.push(`${phase} 出口：要求 tasks.md 至少 ${rule.n} 个任务（当前=${count}）`)
        }
        break
      }
      case 'tasks-all-done': {
        if (ctx?.readFile === undefined || changeDir === undefined) break
        const content = ctx.readFile(`${changeDir}/tasks.md`)
        if (content === undefined) {
          // lib:41-45 tasks_all_done：文件缺失即 FAIL
          failures.push(`${phase} 出口：要求 tasks.md 全部勾选（tasks.md 缺失）`)
        } else {
          const open = content.split('\n').filter((l) => /^- \[ \]/.test(l)).length
          if (open > 0) {
            failures.push(`${phase} 出口：要求 tasks.md 全部勾选（仍有 ${open} 项未勾）`)
          }
        }
        break
      }
      case 'field-file-exists': {
        if (!trackApplies(rule.tracks, track)) break
        if (ctx?.fileExists === undefined) break
        const v = scalar(state.fields[rule.field])
        // lib:67-72 yaml_file_exists：字段空/"null"/文件不存在 都 FAIL（与 nonempty 条双计，老仓同）
        if (v === '' || v === 'null' || !ctx.fileExists(v)) {
          const label = rule.desc ?? `${rule.field} 指向的文件存在`
          failures.push(`${phase} 出口：要求 ${label}${trackSuffix(rule.tracks, track)}（当前='${v}'）`)
        }
        break
      }
      case 'coverage': {
        if (ctx !== undefined) evaluateCoverage(state, ctx, failures, warnings)
        break
      }
      case 'depends-archived': {
        if (ctx?.dirExists === undefined || ctx.changeArchived === undefined) break
        for (const dep of depsOf(state.fields.depends_on)) {
          if (ctx.dirExists(`openspec/changes/${dep}`)) {
            failures.push(`${phase} 出口：依赖 change '${dep}' 必须先归档（当前活跃）`)
          } else if (!ctx.changeArchived(dep)) {
            failures.push(`${phase} 出口：依赖 change '${dep}' 不存在（既不在活跃也不在归档）`)
          }
        }
        break
      }
    }
  }

  const result: GuardResult = { pass: failures.length === 0, failures }
  if (warnings.length > 0) result.warnings = warnings
  return result
}