import { describe, expect, it } from 'vitest'
import {
  TERMINAL_ACTIVITY_PROTOCOL,
  TERMINAL_ACTIVITY_TTL_MS,
  isTerminalSessionId,
  liveTerminalActivity,
  parseTerminalActivityRecord,
} from './terminal-activity.js'

const HEARTBEAT = '2026-07-24T06:00:00.000Z'
const HEARTBEAT_MS = Date.parse(HEARTBEAT)

function raw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: TERMINAL_ACTIVITY_PROTOCOL,
    change: 'community-library',
    session_id: '019f92c7-6e66-7290-9352-f9d915266f14',
    heartbeat_at: HEARTBEAT,
    ...over,
  }
}

describe('terminal activity projection', () => {
  it('只接受受控协议、可携带 session id 的活动记录', () => {
    const parsed = parseTerminalActivityRecord(raw({ turn_id: 'turn-42' }))
    expect(parsed).toMatchObject({ change: 'community-library', sessionId: '019f92c7-6e66-7290-9352-f9d915266f14', turnId: 'turn-42' })
  })

  it('拒绝错误协议、路径式 change 与不可作为文件名的 session id', () => {
    expect(parseTerminalActivityRecord(raw({ protocol: 'other' }))).toBeNull()
    expect(parseTerminalActivityRecord(raw({ change: '../old-change' }))).toBeNull()
    expect(parseTerminalActivityRecord(raw({ session_id: 'session/escape' }))).toBeNull()
    expect(isTerminalSessionId('session/escape')).toBe(false)
  })

  it('仅在 TTL 内把活动投影为 live；到期或未来伪造都自动失效', () => {
    const parsed = parseTerminalActivityRecord(raw())
    if (parsed === null) throw new Error('expected valid terminal activity fixture')
    expect(liveTerminalActivity(parsed, HEARTBEAT_MS + TERMINAL_ACTIVITY_TTL_MS - 1)).toMatchObject({
      sessionId: '019f92c7-6e66-7290-9352-f9d915266f14', heartbeatAt: HEARTBEAT,
    })
    expect(liveTerminalActivity(parsed, HEARTBEAT_MS + TERMINAL_ACTIVITY_TTL_MS)).toBeNull()
    expect(liveTerminalActivity(parsed, HEARTBEAT_MS - 30_001)).toBeNull()
  })
})
