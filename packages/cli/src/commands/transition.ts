/**
 * transition <name> <event> —— 状态机转换（CONTRACT §3，2026-07-06 oracle 实测回写）。
 * stdout：无（`[TRANSITION] name: old -> new` 走 stderr，对齐老内核 green() 落 stderr）；
 * exit：0 成功 / 1 非法转换、未知事件、事件前置校验不满足或其它错误（老内核实测口径）。
 *
 * 流程（锁内闭 TOCTOU，对齐老内核 .txn 事务锁语义）：
 *   withLock { read → 事件 from 相位前置校验 → 事件前置校验（case 块校验体）
 *              → flow.transition → 事件副作用 → write }。
 *
 * ── BACKLOG #14 盘点表：老仓 state-transition.sh cmd_transition（case 块逐字对位）──
 * | 事件/面           | 老仓行号  | 副作用/校验                                        | lite 落点 |
 * |-------------------|----------|---------------------------------------------------|-----------|
 * | （全事件）        | L72      | .txn 事务锁串行化                                  | store.withLock ✓ |
 * | （全事件）        | L113     | require_phase：当前 phase == 事件 from             | 本文件 ✓ |
 * | （全事件）        | L225-226 | phase=to + phase_status（pending/in_progress/done）| kernel flow.transition ✓（相位序泛化）|
 * | （全事件）        | L227     | green [TRANSITION] from → to（stderr）             | 本文件 ✓（lite 用 ASCII "->"，stderr 面 oracle 不比）|
 * | （全事件）        | L239-264 | 进 review 相位落 .pipeline-pending-review 三行     | 本文件 ✓（manifest.reviewPhases 单一真相源）|
 * | （全事件）        | L267     | transitions_history {at,from,to,event}             | history JSONL ✓（event → raw，与 legacy.ts 导入映射同口径）|
 * | （全事件）        | L269-300 | lifecycle hooks（manifest pipeline_hooks，ship 受 auto_commit 闸）| 缺 —— 需 kernel/manifest 派生面（BACKLOG #18）+ M2 hooks 接线，本轮不越权 |
 * | explore-complete  | L120-126 | design_doc 非空/非 null/文件存在                   | 本文件 ✓ |
 * | spec-complete     | L127-138 | track≠pm → plan 非空/非 null/文件存在              | 本文件 ✓ |
 * | spec-complete     | L231-237 | automation 挂起入队（ac_enabled+opted_in）         | 缺 —— automation 子系统（BACKLOG #29b/M5），本轮不越权 |
 * | build-complete    | L144-147 | build_mode/isolation 必须已设                      | 本文件 ✓ |
 * | build-complete    | L148     | validate_enum isolation ∈ {branch,worktree}        | 本文件 ✓（set 闸外的纵深防线）|
 * | build-complete    | L150-153 | preset=full ∧ build_mode=direct → direct_override=true | 本文件 ✓ |
 * | build-complete    | L156-161 | build_sha 冻结 = git HEAD stdout；取不到 → WARN 留原值（unborn 仓字面 "HEAD"，T6 怪癖）| 本文件 ✓ |
 * | verify-pass       | L167-172 | verification_report 非空/非 null/文件存在          | 本文件 ✓ |
 * | verify-pass       | L173-176 | branch_status == handled                           | 本文件 ✓ |
 * | verify-pass       | L179-190 | track≠pm → agent/codex_review_result == pass       | 本文件 ✓ |
 * | verify-pass       | L192-199 | barrier：build_sha 非空非 null ∧ HEAD 可取 ∧ 不等 → 双行 ERROR 拒 | 本文件 ✓ |
 * | verify-pass       | L201-204 | verify_result=pass + verified_at=now               | 本文件 ✓ |
 * | verify-fail       | L207-210 | verify_result=fail + build_sha=null + phase_status=in_progress | 本文件 ✓（phase_status 在 kernel）|
 * | archived          | L213-217 | archived=true + archived_at=now + phase_status=done | 本文件 ✓（phase_status 在 kernel）|
 * | 其它事件          | L219-221 | 无专属校验（open-complete/ship-complete/自定义相位事件）| 本文件 ✓（default 通行）|
 * 校验失败 = 任何写盘之前 exit 1（老仓 case 校验先于 cmd_set phase），ERROR 文案逐字对齐。
 * 文件存在性经 deps.guardCtx 注入（main.ts/harness 全量注入 = 真实校验；未注入 = lite
 * 降级跳过文件面、字段面仍全量——GUARD-RULES §7.2 同款降级口径）。
 */
import { IllegalTransitionError } from '@pipeline-lite/kernel'
import type { FieldName, Phase, PipelineState, TransitionResult } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { eventEdge } from '../events.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { str } from '../render.js'

/** review 相位的 marker 指引文案（prose 保留本地，对齐老内核 state-transition.sh） */
function reviewHint(phase: Phase): string {
  switch (phase) {
    case 'explore': return 'design_doc（深度设计 / 调研 + 关键决策）'
    case 'spec': return 'plan / 用户旅程 / delta spec（实施计划）'
    case 'verify': return 'verification_report（验证结论）'
    default: return '（待复核）'
  }
}

/** 事件前置校验不满足：lines 逐行走 stderr（老内核 red() 逐行），exit 1、零写盘 */
class EventPreconditionError extends Error {
  constructor(public readonly lines: string[]) {
    super(lines[0] ?? 'transition 前置校验不满足')
  }
}

/** 老内核 cmd_get 口径：未设字段是字面 'null'（init heredoc），空串 = 显式清空——两者都算未设 */
function isUnset(v: string): boolean {
  return v === '' || v === 'null'
}

/**
 * 事件前置校验（老内核 case 块校验体的 lite 镜像，行号见顶部盘点表）。
 * 在锁内、任何 mutation 之前执行；不满足 → 抛 EventPreconditionError（文案逐字对齐老仓）。
 */
async function checkEventPreconditions(
  deps: CliDeps,
  name: string,
  event: string,
  state: PipelineState,
): Promise<void> {
  const f = (k: FieldName): string => str(state.fields[k])
  // 文件面：guardCtx（或其 fileExists 谓词）未注入 → 降级跳过（视为存在），字段面不降级
  const exists = deps.guardCtx?.(name)?.fileExists
  const fileExists = (p: string): boolean => (exists ? exists(p) : true)

  switch (event) {
    case 'explore-complete': {
      const dd = f('design_doc')
      if (isUnset(dd) || !fileExists(dd)) {
        throw new EventPreconditionError([`ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=${dd})`])
      }
      break
    }
    case 'spec-complete': {
      // PM Track 可能不需要 plan，frontend/backend 必须（老仓 L132）
      const tr = f('track')
      if (tr !== 'pm') {
        const pl = f('plan')
        if (isUnset(pl) || !fileExists(pl)) {
          throw new EventPreconditionError([`ERROR: ${tr} track spec-complete 要求 plan 字段非空且文件存在 (当前=${pl})`])
        }
      }
      break
    }
    case 'build-complete': {
      const bm = f('build_mode')
      const iso = f('isolation')
      if (isUnset(bm)) throw new EventPreconditionError(['ERROR: build_mode 必须设置'])
      if (isUnset(iso)) throw new EventPreconditionError(['ERROR: isolation 必须设置'])
      // set 闸之外的纵深防线（老仓 validate_enum；直改 yaml 的脏值在此兜住）
      if (iso !== 'branch' && iso !== 'worktree') {
        throw new EventPreconditionError([`ERROR: 非法值 '${iso}'，允许: branch worktree`])
      }
      if (f('preset') === 'full' && bm === 'direct' && f('direct_override') !== 'true') {
        throw new EventPreconditionError(['ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true'])
      }
      break
    }
    case 'verify-pass': {
      const vr = f('verification_report')
      if (isUnset(vr) || !fileExists(vr)) {
        throw new EventPreconditionError([`ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=${vr})`])
      }
      const bs = f('branch_status')
      if (bs !== 'handled') {
        throw new EventPreconditionError([`ERROR: verify-pass 要求 branch_status=handled (当前=${bs})`])
      }
      // frontend/backend 还要求 agent + codex 都 pass（老仓 L179-190；pm 豁免）
      const tr = f('track')
      if (tr !== 'pm') {
        const ar = f('agent_review_result')
        if (ar !== 'pass') throw new EventPreconditionError([`ERROR: ${tr} track 要求 agent_review_result=pass (当前=${ar})`])
        const cr = f('codex_review_result')
        if (cr !== 'pass') throw new EventPreconditionError([`ERROR: ${tr} track 要求 codex_review_result=pass (当前=${cr})`])
      }
      // barrier 校验：verify 审的必须是 build 冻结的那个 SHA（防 build 后偷改未复验）。
      // 仅当 build_sha 非空非 null 且 HEAD 可取时校验；否则退化跳过（ADR 0005）。
      const bsha = f('build_sha')
      const head = (await deps.gitHeadSha?.())?.trim() ?? ''
      if (bsha !== '' && bsha !== 'null' && head !== '' && bsha !== head) {
        throw new EventPreconditionError([
          `ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=${bsha} HEAD=${head}`,
          '  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA',
        ])
      }
      break
    }
    default:
      break // 无专属校验的事件（open-complete/ship-complete/自定义相位事件）通行
  }
}

/** 事件专属副作用（老内核 case 块 mutation 体），锁内、前置校验通过后、写盘前应用 */
async function applyEventEffects(
  deps: CliDeps,
  event: string,
  state: PipelineState,
): Promise<void> {
  switch (event) {
    case 'build-complete': {
      const sha = (await deps.gitHeadSha?.())?.trim() ?? ''
      if (sha) {
        state.fields.build_sha = sha
      } else {
        deps.io.err('WARN: build-complete 未取到 git HEAD（非 git 仓？）build_sha 留空，verify 不做 SHA 校验')
      }
      break
    }
    case 'verify-pass':
      state.fields.verify_result = 'pass'
      state.fields.verified_at = deps.clock()
      break
    case 'verify-fail':
      state.fields.verify_result = 'fail'
      state.fields.build_sha = 'null'
      break
    case 'archived':
      state.fields.archived = 'true'
      state.fields.archived_at = deps.clock()
      break
    default:
      break
  }
}

export async function cmdTransition(deps: CliDeps, name: string, event: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const edge = eventEdge(event)
  if (!edge) {
    deps.io.err(`ERROR: 未知 event: ${event}`)
    return 1
  }

  const dir = changeDir(deps.cwd, name)
  let result: TransitionResult
  try {
    result = await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir)
      const current = str(state.fields.phase)
      if (current !== edge.from) {
        throw new IllegalTransitionError(current as Phase, edge.to)
      }
      await checkEventPreconditions(deps, name, event, state)
      const r = deps.flow.transition(state, edge.to, deps.clock)
      await applyEventEffects(deps, event, r.state)
      await deps.store.write(dir, r.state)
      return r
    })
  } catch (e) {
    if (e instanceof EventPreconditionError) {
      for (const line of e.lines) deps.io.err(line)
      return 1
    }
    if (e instanceof IllegalTransitionError) {
      deps.io.err(`ERROR: ${e.message}`)
      return 1
    }
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }

  if (deps.writeBreadcrumb) {
    try {
      await deps.writeBreadcrumb(dir, `pipeline:${name} phase=${result.to}\n`)
    } catch (e) {
      deps.io.err(`WARN: breadcrumb 写入失败: ${errMsg(e)}`)
    }
  }
  if (deps.history) {
    try {
      await deps.history.append(dir, {
        ts: deps.clock(),
        kind: 'transition',
        from: result.from,
        to: result.to,
        raw: event, // 老仓 transitions_history.event 对位（与 legacy.ts 导入映射同口径）
      })
    } catch (e) {
      deps.io.err(`WARN: history 写入失败: ${errMsg(e)}`)
    }
  }
  // 阶段复核硬闸 marker：进入 review 相位 → 落 .pipeline-pending-review（单一真相源 =
  // manifest.reviewPhases；老内核 state-transition.sh 同款三行格式：相位\n指引\nchange 名）。
  if (deps.writeReviewMarker && deps.flow.manifest.reviewPhases.includes(result.to)) {
    try {
      await deps.writeReviewMarker(`${result.to}\n${reviewHint(result.to)}\n${name}\n`)
    } catch (e) {
      deps.io.err(`WARN: review marker 写入失败: ${errMsg(e)}`)
    }
  }

  deps.io.err(`[TRANSITION] ${name}: ${result.from} -> ${result.to}`)
  return 0
}
