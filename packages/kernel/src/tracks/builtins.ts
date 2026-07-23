/**
 * 内建四轨的精确定义（codex 2026-07-17 裁决钉死的默认值表）。
 *
 * BUILTIN_TRACK_IDS 只在 tracks/ 模块及其消费方内定义使用——kernel/src/types.ts 的 TRACKS
 * 常量仍是现行运行时全集来源，切换属于清单 T 的 R2 阶段（见 GOAL.md）。
 *
 * routing.pattern 的默认值只在本文件定义；项目覆盖统一来自 `.pipeline/tracks.yaml` 的
 * `policy_profile.routing`。manifest 不再承载路由数据，避免默认 registry 与模板互相镜像漂移。
 *
 * routing.priority 数值化自 hooks/router.sh 的平手序：打分仅在「严格大于」时换轨、判定顺序
 * fe→be→pm（HOT PATH 段，先判者赢平手）——故 frontend 300 > backend 200 > pm 100。
 *
 * workflow 绑定缺省 { default:'default', allowed:'*' }：与「没有 tracks.yaml」的现行为
 * 逐字一致（任何 workflow 都可绑定、缺省走 'default'），保证零迁移成本路径。
 */
import type { TrackDefinition, TrackWorkflowBinding } from './types.js'

export const BUILTIN_TRACK_IDS = ['chat', 'pm', 'frontend', 'backend'] as const
export type BuiltinTrackId = (typeof BUILTIN_TRACK_IDS)[number]

export function isBuiltinTrackId(id: string): id is BuiltinTrackId {
  return (BUILTIN_TRACK_IDS as readonly string[]).includes(id)
}

/** 内建三条路由正则的唯一默认真相源（grep -E 方言）。 */
export const BUILTIN_ROUTER_PATTERNS = {
  frontend:
    '(前端|UI|页面|组件|React|Vue|Next|Tailwind|样式|shadcn|\\.tsx|\\.jsx|\\.vue|web 设计|响应式|button|form|layout)',
  backend:
    '(后端|backend|API|接口|数据库|Go |Python |Java |Rust |NestJS|Postgres|endpoint|service|微服务|REST|GraphQL|gRPC|migration|server|controller|schema)',
  pm: '(调研|竞品|市场|竞争对手|对标|商业模式|PRD|需求|用户旅程|原型|market|立项|产品|user persona|流程图)',
} as const

const WORKFLOW_ANY: TrackWorkflowBinding = { default: 'default', allowed: '*' }

export const BUILTIN_TRACK_DEFINITIONS: readonly TrackDefinition[] = [
  {
    id: 'chat',
    label: 'Chat',
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'none',
      routing: { enabled: false },
      skills: { matrix: false, profile: '_all' },
    },
  },
  {
    id: 'pm',
    label: 'PM',
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: 'skipped',
      automationEligible: false,
      coverageProfile: 'pm',
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.pm, priority: 100 },
      skills: { matrix: true, profile: 'pm' },
    },
  },
  {
    id: 'frontend',
    label: 'Frontend',
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'frontend',
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.frontend, priority: 300 },
      skills: { matrix: true, profile: 'frontend' },
    },
  },
  {
    id: 'backend',
    label: 'Backend',
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'backend',
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.backend, priority: 200 },
      skills: { matrix: true, profile: 'backend' },
    },
  },
]

const BUILTIN_BY_ID: ReadonlyMap<BuiltinTrackId, TrackDefinition> = new Map(
  BUILTIN_TRACK_DEFINITIONS.map((t) => [t.id as BuiltinTrackId, t]),
)

/** 取内建定义（id 已由类型收窄，缺失属内部错误）。 */
export function builtinTrack(id: BuiltinTrackId): TrackDefinition {
  const def = BUILTIN_BY_ID.get(id)
  if (!def) throw new Error(`tracks 内部错误：内建定义缺 '${id}'`)
  return def
}
