import { describe, expect, it } from 'vitest'
import type { TrackDefinition } from '@pipeline-lite/kernel'
import { applyRouterDraft, previewTrackRouting, scoreRouterPatternWithGrep } from './routerPreview.js'

function track(input: {
  id: string
  pattern?: string
  priority?: number
  enabled?: boolean
  builtin?: boolean
}): TrackDefinition {
  return {
    id: input.id,
    label: input.id,
    builtin: input.builtin ?? false,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'backend',
      routing: input.enabled === false
        ? { enabled: false }
        : { enabled: true, pattern: input.pattern ?? input.id, priority: input.priority ?? 0 },
      skills: { matrix: true, profile: input.id },
    },
  }
}

describe('Router preview —— 与 hooks/router.sh 的 grep/tie-break 真语义一致', () => {
  it('生产 scorer 真执行 grep -ciE：忽略大小写，按命中行数而非 occurrence 计分', async () => {
    await expect(scoreRouterPatternWithGrep('fix|bug', 'FIX bug bug\nnope\nfix')).resolves.toBe(2)
  })

  it('非法 ERE fail-loud，不把 grep exit=2 伪装成零分', async () => {
    await expect(scoreRouterPatternWithGrep('[', 'anything')).rejects.toThrow(/grep.*exit 2/i)
  })

  it('先比 score，再比 priority，最终并列保持 registry order', async () => {
    const rows = [
      track({ id: 'first', pattern: 'ship', priority: 9 }),
      track({ id: 'second', pattern: 'ship', priority: 10 }),
      track({ id: 'third', pattern: 'ship', priority: 10 }),
    ]
    const result = await previewTrackRouting('ship this', rows, async () => 1)
    expect(result.winner?.track.id).toBe('second')
    expect(result.candidates.map((candidate) => candidate.order)).toEqual([0, 1, 2])
  })

  it('routing disabled 不参与赢家；零分时无赢家', async () => {
    const rows = [track({ id: 'disabled', enabled: false }), track({ id: 'enabled' })]
    const result = await previewTrackRouting('unmatched', rows, async () => 0)
    expect(result.winner).toBeNull()
    expect(result.candidates).toMatchObject([
      { score: 0, routable: false },
      { score: 0, routable: true },
    ])
  })

  it('实际 hook 会抑制的讨论型 prompt 明确返回 suppression，仍保留候选分数供手选', async () => {
    const result = await previewTrackRouting('为什么 backend 会失败', [track({ id: 'backend' })], async () => 3)
    expect(result.suppressed_reason).toBe('discussion')
    expect(result.winner).toBeNull()
    expect(result.candidates[0]?.score).toBe(3)
  })
})

describe('Router preview draft override', () => {
  it('用未保存 custom Track 草稿替换同 id 候选且保持 registry order', () => {
    const current = [track({ id: 'first' }), track({ id: 'qa', pattern: 'old' })]
    const draft = track({ id: 'qa', pattern: 'new', priority: 999 })
    const next = applyRouterDraft(current, draft)
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ id: 'qa', policyProfile: { routing: { pattern: 'new', priority: 999 } } })
  })

  it('新 custom Track 草稿追加到候选；内建 Track policy 草稿拒绝', () => {
    const builtin = track({ id: 'frontend', builtin: true })
    expect(applyRouterDraft([builtin], track({ id: 'qa' }))).toHaveLength(2)
    expect(() => applyRouterDraft([builtin], { ...builtin, policyProfile: track({ id: 'qa' }).policyProfile }))
      .toThrow(/内建 Track/)
  })
})
