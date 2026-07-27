/**
 * action handler 单测（G2 P1）——「老仓语义对照」期望值手写自老仓
 * skills/pipeline/scripts/state-transition.sh cmd_transition 副作用体的阅读，不 import 任何旧函数当
 * oracle。用例名标注对应老仓事件体。与老仓唯一的裁决内形状差：老仓就地改 state.fields，
 * 本层回 patch——「不 mutate」有专门用例钉住。
 */
import { describe, expect, it } from 'vitest'
import type { FieldName } from '../types.js'
import type { ActionInput, ActionOutcome } from './ir.js'
import { ACTION_HANDLERS, applyActions } from './action-handlers.js'
import { allFields } from './test-support.js'

const CLOCK = '2026-07-17T08:00:00Z'

function makeInput(
  over: Partial<Record<FieldName, string | string[]>> = {},
  gitHeadSha?: () => Promise<string>,
  workspaceFingerprint?: () => Promise<string>,
): ActionInput {
  return { fields: allFields(over), clock: () => CLOCK, gitHeadSha, workspaceFingerprint }
}

describe('老仓 state-transition.sh cmd_transition 副作用体语义对照', () => {
  it('L176-181：freeze-build-sha，HEAD 可取 → patch 只含 trim 后的 build_sha，零信号', async () => {
    const out = await ACTION_HANDLERS['freeze-build-sha'](
      { type: 'freeze-build-sha' },
      makeInput({}, async () => 'abc123\n'),
    )
    expect(out).toEqual({ patch: { build_sha: 'abc123' }, signals: [] })
  })

  it('L177+L182-183：gitHeadSha 未注入 → 空 patch + build-sha-missing（`?? ""` 与空串同支）', async () => {
    const out = await ACTION_HANDLERS['freeze-build-sha']({ type: 'freeze-build-sha' }, makeInput())
    expect(out).toEqual({ patch: {}, signals: [{ kind: 'build-sha-missing' }] })
  })

  it('L178：注入但返回空串（非 git 仓）→ 空 patch + build-sha-missing（`if (sha)` 空串 falsy 支）', async () => {
    const out = await ACTION_HANDLERS['freeze-build-sha']({ type: 'freeze-build-sha' }, makeInput({}, async () => ''))
    expect(out).toEqual({ patch: {}, signals: [{ kind: 'build-sha-missing' }] })
  })

  it('L177：返回纯空白（trim 后空）→ 同空串支（build_sha 留原值语义 = patch 不含它）', async () => {
    const out = await ACTION_HANDLERS['freeze-build-sha']({ type: 'freeze-build-sha' }, makeInput({}, async () => '  \n'))
    expect(out).toEqual({ patch: {}, signals: [{ kind: 'build-sha-missing' }] })
  })

  it('in-place：即使 Git HEAD 可取也冻结内容基线，且不读取 Git（未提交工作区不是 HEAD）', async () => {
    let gitCalls = 0
    const out = await ACTION_HANDLERS['freeze-build-sha'](
      { type: 'freeze-build-sha' },
      makeInput(
        { isolation: 'in-place' },
        async () => { gitCalls++; return 'UNUSED' },
        async () => 'workspace:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    )
    expect(out).toEqual({
      patch: { build_sha: 'workspace:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      signals: [],
    })
    expect(gitCalls).toBe(0)
  })

  it('in-place：没有内容基线能力时 fail-closed，不能留下不可复验的 build_sha', async () => {
    await expect(ACTION_HANDLERS['freeze-build-sha'](
      { type: 'freeze-build-sha' }, makeInput({ isolation: 'in-place' }, async () => 'HEAD'),
    )).rejects.toThrow('workspaceFingerprint capability')
  })

  it("L185-188：mark-verification-passed → verify_result='pass' + verified_at=clock()", async () => {
    const out = await ACTION_HANDLERS['mark-verification-passed']({ type: 'mark-verification-passed' }, makeInput())
    expect(out).toEqual({ patch: { verify_result: 'pass', verified_at: CLOCK }, signals: [] })
  })

  it("L189-192：mark-verification-failed → verify_result='fail' + build_sha 打回字面 'null'（barrier 复位）", async () => {
    const out = await ACTION_HANDLERS['mark-verification-failed']({ type: 'mark-verification-failed' }, makeInput())
    expect(out).toEqual({ patch: { verify_result: 'fail', build_sha: 'null' }, signals: [] })
  })

  it("新的实现 visit 把 pre_verify_review_result 重置为 pending", async () => {
    const out = await ACTION_HANDLERS['reset-pre-verify-review'](
      { type: 'reset-pre-verify-review' },
      makeInput({ pre_verify_review_result: 'pass' }),
    )
    expect(out).toEqual({ patch: { pre_verify_review_result: 'pending' }, signals: [] })
  })

  it("L193-196：archive-run → archived='true' + archived_at=clock()", async () => {
    const out = await ACTION_HANDLERS['archive-run']({ type: 'archive-run' }, makeInput())
    expect(out).toEqual({ patch: { archived: 'true', archived_at: CLOCK }, signals: [] })
  })

  it('裁决形状差（刻意）：handler 不原地 mutate——input.fields 全程不变，改动只在 patch 里', async () => {
    const input = makeInput({ verify_result: '', build_sha: 'abc123' })
    await ACTION_HANDLERS['mark-verification-failed']({ type: 'mark-verification-failed' }, input)
    expect(input.fields.verify_result).toBe('')
    expect(input.fields.build_sha).toBe('abc123')
  })
})

describe('applyActions（声明顺序逐项合并）', () => {
  it('空 actions → 空 patch、零信号', async () => {
    expect(await applyActions([], makeInput())).toEqual({ patch: {}, signals: [] })
  })

  it("顺序合并的真实观测（同键后者胜）：[freeze-build-sha, mark-verification-failed] → build_sha 终值 'null'", async () => {
    const out = await applyActions(
      [{ type: 'freeze-build-sha' }, { type: 'mark-verification-failed' }],
      makeInput({}, async () => 'abc123'),
    )
    expect(out.patch).toEqual({ build_sha: 'null', verify_result: 'fail' })
  })

  it('反序则 freeze 覆盖 failed 的 build_sha → 终值是 HEAD（last-writer 合并序，顺序即语义）', async () => {
    const out = await applyActions(
      [{ type: 'mark-verification-failed' }, { type: 'freeze-build-sha' }],
      makeInput({}, async () => 'abc123'),
    )
    expect(out.patch).toEqual({ build_sha: 'abc123', verify_result: 'fail' })
  })

  it('signals 按执行顺序串接（两次 HEAD 不可取 → 两条 build-sha-missing）', async () => {
    const out = await applyActions(
      [{ type: 'freeze-build-sha' }, { type: 'freeze-build-sha' }],
      makeInput({}, async () => ''),
    )
    expect(out.signals).toEqual([{ kind: 'build-sha-missing' }, { kind: 'build-sha-missing' }])
  })

  it('applyActions 也不动 input.fields（合并只发生在视图与返回值上）', async () => {
    const input = makeInput({ archived: '', verify_result: '' })
    await applyActions([{ type: 'mark-verification-passed' }, { type: 'archive-run' }], input)
    expect(input.fields.archived).toBe('')
    expect(input.fields.verify_result).toBe('')
  })

  it('clock 注入贯穿：patch 里的时间戳 = input.clock()（L187/L195 clock() 同源）', async () => {
    const out = await applyActions([{ type: 'mark-verification-passed' }, { type: 'archive-run' }], makeInput())
    expect(out.patch).toEqual({
      verify_result: 'pass', verified_at: CLOCK, archived: 'true', archived_at: CLOCK,
    })
  })
})

describe('注册表无运行时替换面', () => {
  it('ACTION_HANDLERS 已冻结：Object.isFrozen + 改写既有键抛 TypeError（严格模式）', () => {
    expect(Object.isFrozen(ACTION_HANDLERS)).toBe(true)
    expect(() => {
      ;(ACTION_HANDLERS as unknown as Record<string, unknown>)['archive-run'] = () => ({ patch: {}, signals: [] })
    }).toThrow(TypeError)
  })

  it('applyActions 公开签名只有 (actions, input)：多余的第三实参被忽略，替换表劫持不了派发', async () => {
    const rogue = { 'archive-run': () => ({ patch: { archived: 'HIJACKED' }, signals: [] }) }
    const out = await (applyActions as unknown as (...args: unknown[]) => Promise<ActionOutcome>)(
      [{ type: 'archive-run' }],
      makeInput(),
      rogue,
    )
    expect(out.patch).toEqual({ archived: 'true', archived_at: CLOCK })
  })
})
