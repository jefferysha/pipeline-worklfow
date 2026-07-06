import { describe, expect, test } from 'vitest'
import { GATE_TTL_MS } from '@pipeline-lite/kernel'
import { cmdDoctor, type DoctorCheck } from './doctor.js'
import { buildProgram, CliExit } from '../program.js'
import { makeDeps, mockState, type TestDeps } from '../test-support.js'

/** --json 稳定 schema（BACKLOG #26b）：{checks:[{id,status,detail,hint}],summary:{green,yellow,red}} */
interface DoctorJson {
  checks: DoctorCheck[]
  summary: { green: number; yellow: number; red: number }
}

/** 检查面全集——id 即对用户的稳定契约，顺序固定 */
const EXPECTED_IDS = [
  'env:node',
  'env:git',
  'asset:manifest',
  'asset:hooks',
  'guard:gate',
  'guard:statusline',
  'project:cwd',
  'project:changes',
  'project:markers',
  'quality:verify-skills',
] as const

async function runJson(deps: TestDeps): Promise<{ code: number; payload: DoctorJson }> {
  const code = await cmdDoctor(deps, { json: true })
  return { code, payload: JSON.parse(deps.outLines.join('\n')) as DoctorJson }
}

function byId(payload: DoctorJson, id: string): DoctorCheck {
  const c = payload.checks.find((x) => x.id === id)
  if (!c) throw new Error(`check 缺失: ${id}`)
  return c
}

describe('doctor —— 统一健康面（BACKLOG #26b，GOAL B8 降级可见 / D10 > comet doctor）', () => {
  test('全绿基线：10 项检查全 green，exit 0，人读输出含汇总行、无 WARN/FAIL', async () => {
    const deps = makeDeps()
    const code = await cmdDoctor(deps, {})
    expect(code).toBe(0)
    const text = deps.outLines.join('\n')
    expect(text).toContain('[DOCTOR]')
    expect(text).toContain('绿 10')
    expect(text).not.toContain('[WARN]')
    expect(text).not.toContain('[FAIL]')
    expect(text).not.toContain('fix:')
  })

  test('--json schema 稳定：checks 四键齐全、id 顺序固定、summary 计数一致', async () => {
    const { code, payload } = await runJson(makeDeps())
    expect(code).toBe(0)
    expect(Object.keys(payload).sort()).toEqual(['checks', 'summary'])
    expect(payload.checks.map((c) => c.id)).toEqual([...EXPECTED_IDS])
    for (const c of payload.checks) {
      expect(Object.keys(c).sort()).toEqual(['detail', 'hint', 'id', 'status'])
      expect(['green', 'yellow', 'red']).toContain(c.status)
      expect(typeof c.detail).toBe('string')
      expect(typeof c.hint).toBe('string')
    }
    expect(payload.summary).toEqual({ green: 10, yellow: 0, red: 0 })
  })

  test('env:node 红灯：node < 22 → red + 升级指引，exit 1', async () => {
    const deps = makeDeps({ doctor: { nodeVersion: () => 'v20.19.0' } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'env:node')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('v20.19.0')
    expect(c.hint).toContain('22')
  })

  test('env:git 黄灯：git 不可用 → 降级可见（build_sha 记空），黄灯不影响 exit 0', async () => {
    const deps = makeDeps({ doctor: { gitAvailable: async () => false } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'env:git')
    expect(c.status).toBe('yellow')
    expect(c.detail).toContain('build_sha')
    expect(payload.summary.yellow).toBe(1)
  })

  test('asset:manifest 红灯：解析失败 → red 带错误消息', async () => {
    const deps = makeDeps({ doctor: { manifestError: () => 'transitions 缺 open 条目' } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'asset:manifest')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('transitions 缺 open 条目')
  })

  test('asset:hooks 红灯：gate.sh 不可执行 → red 列出具体文件', async () => {
    const deps = makeDeps({
      doctor: { fileExecutable: (p) => !p.endsWith('gate.sh') },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'asset:hooks')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('gate.sh')
    expect(c.detail).toContain('不可执行')
    expect(c.hint).toContain('chmod +x')
  })

  test('guard:gate 红灯：hooks.json 缺失 → 三门不会真拦', async () => {
    const deps = makeDeps({
      doctor: { fileExists: (p) => !p.endsWith('hooks.json') },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'guard:gate')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('hooks.json')
  })

  test('guard:gate 黄灯：PIPELINE_AFK=1 → 三门旁路中（资产完好也降级可见），exit 0', async () => {
    const deps = makeDeps({
      doctor: { env: (n) => (n === 'PIPELINE_AFK' ? '1' : undefined) },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'guard:gate')
    expect(c.status).toBe('yellow')
    expect(c.detail).toContain('三门旁路中')
  })

  test('guard:statusline 黄灯：未接入 settings → 黄灯带接入命令', async () => {
    const deps = makeDeps({ doctor: { statuslineConfigured: () => false } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'guard:statusline')
    expect(c.status).toBe('yellow')
    expect(c.hint).toContain('statusLine')
    expect(c.hint).toContain('statusline.sh')
  })

  test('project:cwd 黄灯：cwd 不是 pipeline 项目（openspec/changes 不存在）', async () => {
    const deps = makeDeps({ doctor: { dirExists: () => false } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'project:cwd')
    expect(c.status).toBe('yellow')
    expect(c.hint).toContain('pipeline init')
  })

  test('project:changes 绿灯：活跃 change 计数进 detail', async () => {
    const deps = makeDeps({ states: { 'ok-change': mockState({ phase: 'build' }) } })
    const { payload } = await runJson(deps)
    const c = byId(payload, 'project:changes')
    expect(c.status).toBe('green')
    expect(c.detail).toContain('1 个活跃 change')
  })

  test('project:changes 红灯：坏 .pipeline.yaml 抽查 → red 列出坏 change 名', async () => {
    const deps = makeDeps({
      states: { 'ok-change': mockState({ phase: 'build' }) },
      changes: ['ok-change', 'broken-change'],
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'project:changes')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('broken-change')
    expect(c.detail).not.toContain('ok-change')
  })

  test('project:markers 黄灯：陈旧门 marker（age > 分级 TTL）→ 清理指引；新鲜 marker → 绿灯', async () => {
    const stale = makeDeps({
      // review 分级 TTL=1800s；超一点即陈旧（#13 分级，非旧统一 15min）
      gateMarkers: [{ kind: 'review', ageMs: GATE_TTL_MS.review + 1, raw: 'spec\nx\ndemo\n' }],
    })
    const { code, payload } = await runJson(stale)
    expect(code).toBe(0)
    const c = byId(payload, 'project:markers')
    expect(c.status).toBe('yellow')
    expect(c.detail).toContain('.pipeline-pending-review')
    expect(c.hint).toContain('rm')

    const fresh = makeDeps({
      gateMarkers: [{ kind: 'confirm', ageMs: 60_000, raw: 'build\nx\ndemo\n' }],
    })
    const freshRun = await runJson(fresh)
    expect(byId(freshRun.payload, 'project:markers').status).toBe('green')
    expect(byId(freshRun.payload, 'project:markers').detail).toContain('生效')
  })

  test('quality:verify-skills 红灯：子进程非 0 → red 带输出摘要', async () => {
    const deps = makeDeps({
      doctor: {
        runVerifySkills: async () => ({
          code: 1,
          output: '[verify-skills] FAIL — 发现 2 处悬空引用/缺失',
        }),
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'quality:verify-skills')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('发现 2 处悬空引用')
    expect(c.hint).toContain('verify-skills')
  })

  test('探针自身异常不炸命令：该项折算 red（fail-loud 可见），其余检查照常', async () => {
    const deps = makeDeps({
      doctor: {
        nodeVersion: () => {
          throw new Error('boom')
        },
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'env:node')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('boom')
    expect(payload.checks).toHaveLength(EXPECTED_IDS.length)
  })

  test('人读输出：非绿项带 [WARN]/[FAIL] 标记与 fix: 指引行', async () => {
    const deps = makeDeps({
      doctor: {
        statuslineConfigured: () => false,
        nodeVersion: () => 'v18.0.0',
      },
    })
    const code = await cmdDoctor(deps, {})
    expect(code).toBe(1)
    const text = deps.outLines.join('\n')
    expect(text).toContain('[FAIL] env:node')
    expect(text).toContain('[WARN] guard:statusline')
    expect(text).toMatch(/fix: /)
  })

  test('doctor 探针未装配：报错 exit 1（doctor 自己不许静默降级）', async () => {
    const deps = makeDeps()
    deps.doctor = undefined
    expect(await cmdDoctor(deps, {})).toBe(1)
    expect(deps.errLines.join('\n')).toContain('探针未装配')
  })

  test('program 路由：pipeline doctor --json 注册可达', async () => {
    const deps = makeDeps()
    let code = 0
    try {
      await buildProgram(deps).parseAsync(['doctor', '--json'], { from: 'user' })
    } catch (e) {
      if (e instanceof CliExit) code = e.code
      else throw e
    }
    expect(code).toBe(0)
    const payload = JSON.parse(deps.outLines.join('\n')) as DoctorJson
    expect(payload.summary).toEqual({ green: 10, yellow: 0, red: 0 })
  })
})
