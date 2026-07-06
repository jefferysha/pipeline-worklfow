/**
 * transition <name> <event> —— 状态机转换（CONTRACT §3，2026-07-06 oracle 实测回写）。
 * stdout：无（`[TRANSITION] name: old -> new` 走 stderr，对齐老内核 green() 落 stderr）；
 * exit：0 成功 / 1 非法转换、未知事件或其它错误（老内核实测口径，原契约表的 2 已回写）。
 *
 * 流程（锁内闭 TOCTOU，对齐老内核 .txn 事务锁语义）：
 *   withLock { read → 事件 from 相位前置校验 → flow.transition → 事件副作用 → write }。
 * 事件副作用逐字对齐老内核 state-transition.sh case 块：
 *   build-complete → build_sha = `git rev-parse HEAD` stdout（unborn 仓捕获字面 "HEAD"，
 *                    T6 实测怪癖；取不到 → WARN 留原值）
 *   verify-pass    → verify_result=pass + verified_at=now
 *   verify-fail    → verify_result=fail + build_sha=null（barrier 回退，ADR 0005）
 *   archived       → archived=true + archived_at=now
 * 成功后 best-effort 旁路副作用：.breadcrumb 缓存（CONTRACT §5.4）、
 * .pipeline-history.jsonl（CONTRACT §1）、进入 review 相位时落 <cwd>/.pipeline-pending-review
 * 门 marker（相位集合真读 manifest.reviewPhases——单一真相源）——失败仅 WARN。
 */
import { IllegalTransitionError } from '@pipeline-lite/kernel'
import type { Phase, PipelineState, TransitionResult } from '@pipeline-lite/kernel'
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

/** 事件专属副作用（老内核 state-transition.sh case 块的 lite 镜像），锁内、写盘前应用 */
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
      const r = deps.flow.transition(state, edge.to, deps.clock)
      await applyEventEffects(deps, event, r.state)
      await deps.store.write(dir, r.state)
      return r
    })
  } catch (e) {
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
