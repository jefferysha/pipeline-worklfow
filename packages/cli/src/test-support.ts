/**
 * 测试基座：StateStore / FlowEngine 的 mock 工厂 + 依赖装配 helper。
 * 只依赖 types 契约（@pipeline-lite/kernel 目前仅 re-export types），零 vitest 依赖，
 * 因此可被 tsc 正常编译（不进任何运行时路径）。
 */
import {
  FIELD_ORDER,
  IllegalTransitionError,
  LIST_FIELDS,
  PHASES,
} from '@pipeline-lite/kernel'
import type {
  FieldName,
  GuardContext,
  GuardResult,
  HistoryEntry,
  InitOptions,
  ManifestData,
  Phase,
  PipelineState,
  SkillTable,
  TransitionResult,
} from '@pipeline-lite/kernel'
import type { CliDeps, DoctorProbes, GateMarkerInfo } from './deps.js'

// === 调用记录 spy（不引 vitest，纯手写） ===

export interface Recorded<A extends unknown[], R> {
  (...args: A): R
  calls: A[]
}

export function spy<A extends unknown[], R>(impl: (...args: A) => R): Recorded<A, R> {
  const calls: A[] = []
  const fn = (...args: A): R => {
    calls.push(args)
    return impl(...args)
  }
  return Object.assign(fn, { calls })
}

// === PipelineState 工厂：37 字段全量、缺省空串 / 空列表 ===

export function mockState(fields: Partial<Record<FieldName, string | string[]>> = {}): PipelineState {
  const all = {} as Record<FieldName, string | string[]>
  for (const f of FIELD_ORDER) {
    // workflow 缺省 'default'——镜像 kernel emptyFields()（Task 4）；否则 mockState 会产出
    // workflow==='' 让每个默认路径单测误入自定义 workflow 分支（'' !== 'default'）。
    all[f] = f === 'workflow' ? 'default' : (LIST_FIELDS as readonly string[]).includes(f) ? [] : ''
  }
  return { fields: { ...all, ...fields }, opaqueTail: '' }
}

// === StateStore mock：支持单 state 或 name→state 映射（status/list 多 change 场景） ===

type StateInput = PipelineState | Record<string, PipelineState>

function isSingleState(s: StateInput): s is PipelineState {
  return 'fields' in s && 'opaqueTail' in s
}

export function mockStore(states: StateInput = mockState()) {
  const lookup = (changeDir: string): PipelineState => {
    if (isSingleState(states)) return states
    const name = changeDir.split('/').pop() ?? ''
    const s = states[name]
    if (!s) throw new Error(`ENOENT: 状态文件不存在: ${changeDir}/.pipeline.yaml`)
    return s
  }
  return {
    read: spy(async (changeDir: string): Promise<PipelineState> => lookup(changeDir)),
    write: spy(async (_changeDir: string, _state: PipelineState): Promise<void> => {}),
    get: spy(
      async (changeDir: string, field: FieldName): Promise<string | string[] | undefined> =>
        lookup(changeDir).fields[field],
    ),
    set: spy(async (_changeDir: string, _field: FieldName, _value: string | string[]): Promise<void> => {}),
    setMany: spy(
      async (_changeDir: string, _kv: Partial<Record<FieldName, string | string[]>>): Promise<void> => {},
    ),
    cas: spy(
      async (_changeDir: string, _field: FieldName, _expect: string, _next: string): Promise<boolean> => true,
    ),
    init: spy(
      async (opts: InitOptions): Promise<string> => `${opts.repoRoot}/openspec/changes/${opts.name}`,
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withLock: spy(async (_changeDir: string, fn: () => Promise<any>): Promise<any> => fn()),
  }
}

export type MockStore = ReturnType<typeof mockStore>

// === FlowEngine mock：契约相位图（open→…→archive，build⇄verify，archive 自环） ===

export const TEST_MANIFEST: ManifestData = {
  phases: PHASES,
  transitions: {
    open: ['explore'],
    explore: ['spec'],
    spec: ['build'],
    build: ['verify'],
    verify: ['ship', 'build'],
    ship: ['archive'],
    archive: ['archive'],
  },
  reviewPhases: ['explore', 'spec', 'verify'],
}

function phaseOf(state: PipelineState): Phase {
  const v = state.fields.phase
  return (Array.isArray(v) ? v.join(',') : v) as Phase
}

export function mockFlow(manifest: ManifestData = TEST_MANIFEST) {
  return {
    manifest,
    legalTransitions: spy((phase: Phase): readonly Phase[] => manifest.transitions[phase] ?? []),
    transition: spy((state: PipelineState, to: Phase, clock?: () => string): TransitionResult => {
      const from = phaseOf(state)
      const legal = manifest.transitions[from] ?? []
      if (!legal.includes(to)) throw new IllegalTransitionError(from, to)
      const next: PipelineState = {
        ...state,
        fields: { ...state.fields, phase: to, phase_status: 'pending', updated_at: clock?.() ?? '' },
      }
      return { from, to, state: next }
    }),
    guardCheck: spy((_state: PipelineState, _ctx?: GuardContext): GuardResult => ({ pass: true, failures: [] })),
  }
}

export type MockFlow = ReturnType<typeof mockFlow>

// === DoctorProbes mock：缺省全健康（全绿基线），单测按检查面逐项覆写 ===

/**
 * 缺技能检测（批2 A1）缺省 fixture：manifestSkills 两表 + installedSkillNames 缺省全在位。
 * token 刻意取真 registry（templates/skill-sources.yaml）里的真名，让 checkSkills 侧
 * 真读的 registry 能对 verify=builtin / openspec-propose=bundled 判「恒在位」、对其余按名判在位——
 * 单测只需覆写 installedSkillNames 增删一个 token 即可精确制造 缺强制/缺推荐/全在位 三态。
 */
const DEFAULT_MANIFEST_SKILLS: { mandatory: SkillTable; recommended: SkillTable } = {
  // grill-with-docs 须真装；verify|verification-loop（builtin）与 opsx:propose|openspec-propose（bundled）恒在位
  mandatory: { build: { frontend: ['grill-with-docs', 'verify|verification-loop', 'opsx:propose|openspec-propose'] } } as unknown as SkillTable,
  recommended: { build: { frontend: ['search-first'] } } as unknown as SkillTable,
}

export function mockDoctorProbes(overrides: Partial<DoctorProbes> = {}): DoctorProbes {
  return {
    nodeVersion: () => 'v22.5.0',
    gitAvailable: async () => true,
    pluginRoot: '/plugin',
    manifestError: () => null,
    fileExists: () => true,
    fileExecutable: () => true,
    dirExists: () => true,
    env: () => undefined,
    statuslineConfigured: () => true,
    runVerifySkills: async () => ({ code: 0, output: '[verify-skills] OK' }),
    // 缺技能检测（批2 A1）：缺省全在位 → skills:mandatory/recommended 双绿；单测逐项覆写
    installedSkillNames: () => new Set(['grill-with-docs', 'search-first']),
    manifestSkills: () => DEFAULT_MANIFEST_SKILLS,
    // AFK 就绪四检（R1）：缺省全就绪（docker 可用 / 镜像在位 / 两 runner 凭证已配）→ afk:* 四绿基线；
    // 单测按需覆写 afkReadiness 制造 docker 缺 / 镜像缺 / 凭证缺 各态。
    afkReadiness: async () => ({
      ok: true as const,
      docker: { available: true },
      image: { configured: 'sandcastle:local', present: true, build_hint: 'bash tools/sandcastle/build.sh' },
      credentials: {
        'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: true, source: 'host-env' as const } },
        codex: {
          OPENAI_API_KEY: { set: true, source: 'host-env' as const },
          CODEX_HOME: { set: true, source: 'host-env' as const },
        },
      },
    }),
    ...overrides,
  }
}

// === 依赖装配 ===

export interface TestDeps extends CliDeps {
  store: MockStore
  flow: MockFlow
  listChanges: Recorded<[string], Promise<string[]>>
  outLines: string[]
  errLines: string[]
  breadcrumbs: Array<[string, string]>
  historyEntries: Array<[string, HistoryEntry]>
  /** registerProject 收到的 repoRoot 记录（v5 T2 决策 D：init best-effort 自动登记） */
  registeredRoots: string[]
}

export interface MakeDepsOpts {
  state?: PipelineState
  states?: Record<string, PipelineState>
  /** listChanges 返回值；缺省 = states 的 key 集合（无 states 则空） */
  changes?: string[]
  cwd?: string
  /** readGateMarkers 返回值（inbox 用），缺省空 */
  gateMarkers?: GateMarkerInfo[]
  /** readHistoryRaw 返回值（import 幂等检查用），缺省空串 */
  historyRaw?: string
  /** check 命令 guard 文件面注入（BACKLOG #12），缺省 undefined = lite 纯字段面 */
  guardCtx?: (name: string) => GuardContext
  /** doctor 探针覆写（BACKLOG #26b）；缺省全健康 = 全绿基线 */
  doctor?: Partial<DoctorProbes>
}

export const FIXED_CLOCK = '2026-07-06T00:00:00Z'

export function makeDeps(o: MakeDepsOpts = {}): TestDeps {
  const outLines: string[] = []
  const errLines: string[] = []
  const breadcrumbs: Array<[string, string]> = []
  const historyEntries: Array<[string, HistoryEntry]> = []
  const registeredRoots: string[] = []
  const changes = o.changes ?? (o.states ? Object.keys(o.states) : [])
  return {
    store: mockStore(o.states ?? o.state ?? mockState()),
    flow: mockFlow(),
    cwd: o.cwd ?? '/repo',
    io: {
      out: (line: string) => outLines.push(line),
      err: (line: string) => errLines.push(line),
    },
    clock: () => FIXED_CLOCK,
    listChanges: spy(async (_root: string): Promise<string[]> => changes),
    guardCtx: o.guardCtx,
    doctor: mockDoctorProbes(o.doctor),
    readGateMarkers: async () => o.gateMarkers ?? [],
    readHistoryRaw: async (_dir: string) => o.historyRaw ?? '',
    writeBreadcrumb: async (changeDir: string, content: string) => {
      breadcrumbs.push([changeDir, content])
    },
    history: {
      append: async (changeDir: string, entry: HistoryEntry) => {
        historyEntries.push([changeDir, entry])
      },
    },
    registerProject: async (repoRoot: string) => {
      registeredRoots.push(repoRoot)
    },
    outLines,
    errLines,
    breadcrumbs,
    historyEntries,
    registeredRoots,
  }
}
