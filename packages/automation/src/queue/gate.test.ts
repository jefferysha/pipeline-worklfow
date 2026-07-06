import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_RUNNER_ENV,
  PIPELINE_AFK_ENV,
  afkGateBypasses,
  buildQueuedGuardBlocks,
  optedIn,
  shouldEnqueueOnSpecComplete,
} from './gate.js'

describe('PIPELINE_AFK 沙箱放行门（老仓 pipeline-gate.sh:16-25）', () => {
  it('仅 PIPELINE_AFK=1 放行三门；host 端恒未设 → 不放行', () => {
    expect(afkGateBypasses({ [PIPELINE_AFK_ENV]: '1' })).toBe(true)
    expect(afkGateBypasses({ [PIPELINE_AFK_ENV]: '0' })).toBe(false)
    expect(afkGateBypasses({})).toBe(false)
    expect(afkGateBypasses({ [PIPELINE_AFK_ENV]: 'true' })).toBe(false) // 严格 =1
  })
})

describe('build 相位 automation=queued 双执行守卫（老仓 pipeline-guard.sh:147-162）', () => {
  it('phase=build && automation=queued && 非 runner → 拦主线 build（HARD STOP）', () => {
    expect(buildQueuedGuardBlocks({ phase: 'build', automation: 'queued', isRunner: false })).toBe(true)
  })
  it('调度器旁路 PIPELINE_AUTOMATION_RUNNER=1 → 放行', () => {
    expect(buildQueuedGuardBlocks({ phase: 'build', automation: 'queued', isRunner: true })).toBe(false)
    expect(AUTOMATION_RUNNER_ENV).toBe('PIPELINE_AUTOMATION_RUNNER')
  })
  it('非 queued / 非 build → 不拦（人工路径不受影响）', () => {
    expect(buildQueuedGuardBlocks({ phase: 'build', automation: 'scheduled', isRunner: false })).toBe(false)
    expect(buildQueuedGuardBlocks({ phase: 'verify', automation: 'queued', isRunner: false })).toBe(false)
    expect(buildQueuedGuardBlocks({ phase: 'build', automation: 'off', isRunner: false })).toBe(false)
  })
})

describe('两层开关 + opt-in 判定（老仓 automation-config.sh:19-94）', () => {
  it('PM track 永不 opt-in', () => {
    expect(optedIn({ track: 'pm', automation: 'queued', defaultOptIn: true })).toBe(false)
  })
  it('已预置 automation=queued = 显式挂起意图 → opted-in', () => {
    expect(optedIn({ track: 'backend', automation: 'queued', defaultOptIn: false })).toBe(true)
  })
  it('否则取全局 default_opt_in', () => {
    expect(optedIn({ track: 'backend', automation: 'off', defaultOptIn: true })).toBe(true)
    expect(optedIn({ track: 'backend', automation: 'off', defaultOptIn: false })).toBe(false)
  })
  it('shouldEnqueueOnSpecComplete：enabled && opted-in 都 ON 才挂队', () => {
    expect(shouldEnqueueOnSpecComplete({ enabled: true, track: 'backend', automation: 'queued', defaultOptIn: false })).toBe(true)
    expect(shouldEnqueueOnSpecComplete({ enabled: false, track: 'backend', automation: 'queued', defaultOptIn: true })).toBe(false) // fail-safe OFF
    expect(shouldEnqueueOnSpecComplete({ enabled: true, track: 'pm', automation: 'queued', defaultOptIn: true })).toBe(false) // PM 永不
  })
})
