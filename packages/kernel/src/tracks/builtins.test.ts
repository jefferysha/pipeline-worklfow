/**
 * 内建四轨默认值逐字段断言（codex 2026-07-17 裁决钉死的默认值表）。路由默认值只来自
 * BUILTIN_ROUTER_PATTERNS；模板不得再声明旧路由字段。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { TrackDefinition } from './types.js'
import {
  BUILTIN_ROUTER_PATTERNS,
  BUILTIN_TRACK_DEFINITIONS,
  BUILTIN_TRACK_IDS,
  builtinTrack,
  isBuiltinTrackId,
} from './builtins.js'

function byId(id: string): TrackDefinition {
  const def = BUILTIN_TRACK_DEFINITIONS.find((t) => t.id === id)
  if (!def) throw new Error(`内建定义缺 ${id}`)
  return def
}

describe('内建四轨定义', () => {
  test('顺序固定 chat/pm/frontend/backend；全部 builtin:true；workflow 缺省 default + allowed *', () => {
    expect(BUILTIN_TRACK_DEFINITIONS.map((t) => t.id)).toEqual(['chat', 'pm', 'frontend', 'backend'])
    expect([...BUILTIN_TRACK_IDS]).toEqual(['chat', 'pm', 'frontend', 'backend'])
    for (const t of BUILTIN_TRACK_DEFINITIONS) {
      expect(t.builtin, t.id).toBe(true)
      expect(t.workflow, t.id).toEqual({ default: 'default', allowed: '*' })
    }
  })

  test('chat：pending / automation 可 / coverage none / 不路由 / 不进矩阵、profile _all', () => {
    expect(byId('chat')).toEqual({
      id: 'chat',
      label: 'Chat',
      builtin: true,
      workflow: { default: 'default', allowed: '*' },
      policyProfile: {
        reviewSeed: 'pending',
        automationEligible: true,
        coverageProfile: 'none',
        routing: { enabled: false },
        skills: { matrix: false, profile: '_all' },
      },
    })
  })

  test('pm：skipped / automation 不可 / coverage pm / 路由 priority 100 / 矩阵 profile pm', () => {
    expect(byId('pm')).toEqual({
      id: 'pm',
      label: 'PM',
      builtin: true,
      workflow: { default: 'default', allowed: '*' },
      policyProfile: {
        reviewSeed: 'skipped',
        automationEligible: false,
        coverageProfile: 'pm',
        routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.pm, priority: 100 },
        skills: { matrix: true, profile: 'pm' },
      },
    })
  })

  test('frontend：pending / automation 可 / coverage frontend / 路由 priority 300 / 矩阵 profile frontend', () => {
    expect(byId('frontend')).toEqual({
      id: 'frontend',
      label: 'Frontend',
      builtin: true,
      workflow: { default: 'default', allowed: '*' },
      policyProfile: {
        reviewSeed: 'pending',
        automationEligible: true,
        coverageProfile: 'frontend',
        routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.frontend, priority: 300 },
        skills: { matrix: true, profile: 'frontend' },
      },
    })
  })

  test('backend：pending / automation 可 / coverage backend / 路由 priority 200 / 矩阵 profile backend', () => {
    expect(byId('backend')).toEqual({
      id: 'backend',
      label: 'Backend',
      builtin: true,
      workflow: { default: 'default', allowed: '*' },
      policyProfile: {
        reviewSeed: 'pending',
        automationEligible: true,
        coverageProfile: 'backend',
        routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.backend, priority: 200 },
        skills: { matrix: true, profile: 'backend' },
      },
    })
  })

  test('priority 对齐 router.sh 平手序 fe→be→pm（仅严格大于才换轨，先判者赢）：300 > 200 > 100', () => {
    const prio = (id: string): number => {
      const r = byId(id).policyProfile.routing
      if (!r.enabled) throw new Error(`${id} 未启用路由`)
      return r.priority
    }
    expect(prio('frontend')).toBeGreaterThan(prio('backend'))
    expect(prio('backend')).toBeGreaterThan(prio('pm'))
  })

  test('内建 routing 常量是默认真相源，templates manifest 不再镜像路由字段', () => {
    expect(BUILTIN_ROUTER_PATTERNS).toEqual({
      frontend:
        '(前端|UI|页面|组件|React|Vue|Next|Tailwind|样式|shadcn|\\.tsx|\\.jsx|\\.vue|web 设计|响应式|button|form|layout)',
      backend:
        '(后端|backend|API|接口|数据库|Go |Python |Java |Rust |NestJS|Postgres|endpoint|service|微服务|REST|GraphQL|gRPC|migration|server|controller|schema)',
      pm: '(调研|竞品|市场|竞争对手|对标|商业模式|PRD|需求|用户旅程|原型|market|立项|产品|user persona|流程图)',
    })

    const manifestPath = fileURLToPath(new URL('../../../../templates/manifest.yaml', import.meta.url))
    const manifest = readFileSync(manifestPath, 'utf8')
    expect(manifest).not.toMatch(/^router_patterns:/m)
  })

  test('isBuiltinTrackId / builtinTrack', () => {
    expect(isBuiltinTrackId('pm')).toBe(true)
    expect(isBuiltinTrackId('data')).toBe(false)
    expect(isBuiltinTrackId('_all')).toBe(false)
    expect(builtinTrack('chat').label).toBe('Chat')
  })
})
