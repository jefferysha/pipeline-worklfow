import { describe, expect, test } from 'vitest'
import { IllegalTransitionError, TRANSITION_EVENTS, eventEdge as kernelEventEdge } from '@pipeline-lite/kernel'
import type { Phase, PipelineState, TransitionResult } from '@pipeline-lite/kernel'
import { cmdTransition } from './transition.js'
import { EVENTS, eventEdge } from '../events.js'
import { FIXED_CLOCK, makeDeps, mockState, spy } from '../test-support.js'

/** 接线级：cli 真消费 kernel 单一真相源（BACKLOG #25b / GOAL B2）——events.ts 已无本地镜像，
 * 只是 kernel TRANSITION_EVENTS/eventEdge 的稳定别名（引用同一对象=同一真相源）。 */
describe('接线 —— cli 事件表 = kernel 单源（无本地镜像）', () => {
  test('EVENTS 就是 kernel TRANSITION_EVENTS（引用同一对象）', () => {
    expect(EVENTS).toBe(TRANSITION_EVENTS)
  })
  test('eventEdge 就是 kernel eventEdge（同一函数）', () => {
    expect(eventEdge).toBe(kernelEventEdge)
  })
})

describe('transition —— [TRANSITION] 走 stderr / 非法 exit 1（oracle 实测回写）', () => {
  test('合法转换：stdout 无输出，[TRANSITION] 走 stderr，exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: open -> explore')
  })

  test('事件映射目标相位并透传注入时钟给 flow.transition', async () => {
    // track=pm 豁免 spec-complete 的 plan 前置（BACKLOG #14），本测只关注边映射
    const deps = makeDeps({ state: mockState({ phase: 'spec', track: 'pm' }) })
    await cmdTransition(deps, 'demo', 'spec-complete')
    const call = deps.flow.transition.calls[0]
    expect(call?.[1]).toBe('build')
    expect(call?.[2]).toBe(deps.clock)
  })

  test('新状态经 store.write 落盘，且整体在 withLock 内', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build', build_mode: 'direct', isolation: 'worktree' }) })
    await cmdTransition(deps, 'demo', 'build-complete')
    expect(deps.store.withLock.calls).toHaveLength(1)
    expect(deps.store.write.calls).toHaveLength(1)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.fields.phase).toBe('verify')
  })

  test('verify-fail 回退边：verify -> build（stderr），且 build_sha 清 null', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'verify' }) })
    const code = await cmdTransition(deps, 'demo', 'verify-fail')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: verify -> build')
  })

  test('archived 终态自环：archive -> archive（stderr）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'archive' }) })
    const code = await cmdTransition(deps, 'demo', 'archived')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: archive -> archive')
  })

  test('当前 phase 与事件 from 不符：exit 1（老内核口径），flow 不被调用、不写盘', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    const code = await cmdTransition(deps, 'demo', 'verify-pass')
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.flow.transition.calls).toHaveLength(0)
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('flow 抛 IllegalTransitionError：exit 2，无 stdout', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'verify' }) })
    deps.flow.transition = spy((_s: PipelineState, _to: Phase, _c?: () => string): TransitionResult => {
      throw new IllegalTransitionError('verify', 'ship')
    })
    const code = await cmdTransition(deps, 'demo', 'verify-pass')
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('未知 event：exit 1（老内核口径），store 不被触碰', async () => {
    const deps = makeDeps()
    const code = await cmdTransition(deps, 'demo', 'warp-speed')
    expect(code).toBe(1)
    expect(deps.store.read.calls).toHaveLength(0)
  })

  test('状态文件缺失（read 抛错）：exit 1', async () => {
    const deps = makeDeps()
    deps.store.read = spy(async (_d: string): Promise<PipelineState> => {
      throw new Error('ENOENT')
    })
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(1)
  })

  test('成功后写 breadcrumb 缓存（CONTRACT §5.4）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdTransition(deps, 'demo', 'open-complete')
    expect(deps.breadcrumbs).toHaveLength(1)
    expect(deps.breadcrumbs[0]?.[0]).toBe('/repo/openspec/changes/demo')
    expect(deps.breadcrumbs[0]?.[1]).toContain('explore')
  })

  test('成功后 append 一条 transition 历史，raw=事件名（老仓 transitions_history.event 对位）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdTransition(deps, 'demo', 'open-complete')
    expect(deps.historyEntries).toEqual([
      ['/repo/openspec/changes/demo', { ts: FIXED_CLOCK, kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' }],
    ])
  })

  test('breadcrumb 写失败仅 WARN，不影响 exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    deps.writeBreadcrumb = async () => {
      throw new Error('EACCES')
    }
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('WARN')
  })

  test('非法 change 名：exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdTransition(deps, 'bad name', 'open-complete')
    expect(code).toBe(1)
  })
})

/** 老仓 state-transition.sh case 块的事件前置校验（BACKLOG #14）——mock 快速回归。
 * 文件存在性走 deps.guardCtx 注入（缺省未注入 = lite 降级跳过文件面，字段面仍全量）。 */
describe('transition —— 事件前置校验（老仓 case 块，exit 1 + ERROR 走 stderr + 不写盘）', () => {
  const ctxAllFiles = (exists: boolean) => (name: string) => ({
    changeDirRel: `openspec/changes/${name}`,
    fileExists: () => exists,
    fileNonempty: () => exists,
    readFile: () => undefined,
    dirExists: () => false,
    changeArchived: () => false,
    automationRunner: false,
  })

  test('explore-complete：design_doc 字面 null → exit 1，不写盘（老仓 L120-126）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'explore', design_doc: 'null' }) })
    expect(await cmdTransition(deps, 'demo', 'explore-complete')).toBe(1)
    expect(deps.errLines).toContain('ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=null)')
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('explore-complete：design_doc 文件不存在（guardCtx 注入 false）→ exit 1', async () => {
    const deps = makeDeps({
      state: mockState({ phase: 'explore', design_doc: 'docs/d.md' }),
      guardCtx: ctxAllFiles(false),
    })
    expect(await cmdTransition(deps, 'demo', 'explore-complete')).toBe(1)
    expect(deps.errLines).toContain('ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=docs/d.md)')
  })

  test('explore-complete：design_doc 存在 → exit 0', async () => {
    const deps = makeDeps({
      state: mockState({ phase: 'explore', design_doc: 'docs/d.md' }),
      guardCtx: ctxAllFiles(true),
    })
    expect(await cmdTransition(deps, 'demo', 'explore-complete')).toBe(0)
  })

  test('spec-complete：backend 无 plan → exit 1；pm 豁免 → exit 0（老仓 L127-138）', async () => {
    const be = makeDeps({ state: mockState({ phase: 'spec', track: 'backend', plan: 'null' }) })
    expect(await cmdTransition(be, 'demo', 'spec-complete')).toBe(1)
    expect(be.errLines).toContain('ERROR: backend track spec-complete 要求 plan 字段非空且文件存在 (当前=null)')
    const pm = makeDeps({ state: mockState({ phase: 'spec', track: 'pm', plan: 'null' }) })
    expect(await cmdTransition(pm, 'demo', 'spec-complete')).toBe(0)
  })

  test('build-complete：build_mode/isolation 未设逐个拒（老仓 L144-147）', async () => {
    const noBm = makeDeps({ state: mockState({ phase: 'build' }) })
    expect(await cmdTransition(noBm, 'demo', 'build-complete')).toBe(1)
    expect(noBm.errLines).toContain('ERROR: build_mode 必须设置')
    const noIso = makeDeps({ state: mockState({ phase: 'build', build_mode: 'direct', isolation: 'null' }) })
    expect(await cmdTransition(noIso, 'demo', 'build-complete')).toBe(1)
    expect(noIso.errLines).toContain('ERROR: isolation 必须设置')
  })

  test('build-complete：isolation 非法枚举防线（老仓 validate_enum L148）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build', build_mode: 'direct', isolation: 'bogus' }) })
    expect(await cmdTransition(deps, 'demo', 'build-complete')).toBe(1)
    expect(deps.errLines).toContain("ERROR: 非法值 'bogus'，允许: branch worktree")
  })

  test('build-complete：full+direct 必须 direct_override=true（老仓 L150-153）', async () => {
    const deps = makeDeps({
      state: mockState({ phase: 'build', preset: 'full', build_mode: 'direct', isolation: 'worktree' }),
    })
    expect(await cmdTransition(deps, 'demo', 'build-complete')).toBe(1)
    expect(deps.errLines).toContain('ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true')
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('verify-pass：report → branch_status → agent → codex 首错优先序（老仓 L167-190）', async () => {
    const base = {
      phase: 'verify' as const,
      track: 'backend',
      verification_report: 'docs/v.md',
      branch_status: 'pending',
      agent_review_result: 'pending',
      codex_review_result: 'pending',
    }
    const noVr = makeDeps({ state: mockState({ ...base, verification_report: 'null' }), guardCtx: ctxAllFiles(true) })
    expect(await cmdTransition(noVr, 'demo', 'verify-pass')).toBe(1)
    expect(noVr.errLines).toContain('ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=null)')
    const noBs = makeDeps({ state: mockState(base), guardCtx: ctxAllFiles(true) })
    expect(await cmdTransition(noBs, 'demo', 'verify-pass')).toBe(1)
    expect(noBs.errLines).toContain('ERROR: verify-pass 要求 branch_status=handled (当前=pending)')
    const noAr = makeDeps({ state: mockState({ ...base, branch_status: 'handled' }), guardCtx: ctxAllFiles(true) })
    expect(await cmdTransition(noAr, 'demo', 'verify-pass')).toBe(1)
    expect(noAr.errLines).toContain('ERROR: backend track 要求 agent_review_result=pass (当前=pending)')
    const noCr = makeDeps({
      state: mockState({ ...base, branch_status: 'handled', agent_review_result: 'pass' }),
      guardCtx: ctxAllFiles(true),
    })
    expect(await cmdTransition(noCr, 'demo', 'verify-pass')).toBe(1)
    expect(noCr.errLines).toContain('ERROR: backend track 要求 codex_review_result=pass (当前=pending)')
  })

  test('verify-pass：pm track 豁免双 review（skipped 通过，老仓 L180 分支）', async () => {
    const deps = makeDeps({
      state: mockState({
        phase: 'verify',
        track: 'pm',
        verification_report: 'docs/v.md',
        branch_status: 'handled',
        agent_review_result: 'skipped',
        codex_review_result: 'skipped',
      }),
      guardCtx: ctxAllFiles(true),
    })
    expect(await cmdTransition(deps, 'demo', 'verify-pass')).toBe(0)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.fields.verify_result).toBe('pass')
    expect(written.fields.verified_at).toBe(FIXED_CLOCK)
  })

  test('verify-pass barrier：build_sha≠HEAD 拒（双行 ERROR，老仓 L192-199）', async () => {
    const deps = makeDeps({
      state: mockState({
        phase: 'verify',
        track: 'pm',
        verification_report: 'docs/v.md',
        branch_status: 'handled',
        build_sha: 'CAFEBABE',
      }),
      guardCtx: ctxAllFiles(true),
    })
    deps.gitHeadSha = async () => 'DEADBEEF\n'
    expect(await cmdTransition(deps, 'demo', 'verify-pass')).toBe(1)
    expect(deps.errLines).toContain(
      'ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=CAFEBABE HEAD=DEADBEEF',
    )
    expect(deps.errLines).toContain('  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA')
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('verify-pass barrier 退化：build_sha=null 或 HEAD 取不到 → 跳过校验（老仓 L196 条件）', async () => {
    const nullSha = makeDeps({
      state: mockState({
        phase: 'verify', track: 'pm', verification_report: 'docs/v.md',
        branch_status: 'handled', build_sha: 'null',
      }),
      guardCtx: ctxAllFiles(true),
    })
    nullSha.gitHeadSha = async () => 'DEADBEEF'
    expect(await cmdTransition(nullSha, 'demo', 'verify-pass')).toBe(0)
    const noHead = makeDeps({
      state: mockState({
        phase: 'verify', track: 'pm', verification_report: 'docs/v.md',
        branch_status: 'handled', build_sha: 'CAFEBABE',
      }),
      guardCtx: ctxAllFiles(true),
    })
    noHead.gitHeadSha = async () => ''
    expect(await cmdTransition(noHead, 'demo', 'verify-pass')).toBe(0)
  })

  test('verify-fail：无前置校验，verify_result=fail + build_sha=null 落写（老仓 L206-211）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'verify', build_sha: 'DEADBEEF' }) })
    expect(await cmdTransition(deps, 'demo', 'verify-fail')).toBe(0)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.fields.verify_result).toBe('fail')
    expect(written.fields.build_sha).toBe('null')
  })

  test('archived：archived=true + archived_at 落写（老仓 L212-218）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'archive' }) })
    expect(await cmdTransition(deps, 'demo', 'archived')).toBe(0)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.fields.archived).toBe('true')
    expect(written.fields.archived_at).toBe(FIXED_CLOCK)
  })
})
