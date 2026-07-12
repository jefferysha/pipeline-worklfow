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

/** 检查面全集——id 即对用户的稳定契约，顺序固定（批2 A1 尾部 skills:*；R1 尾部 afk:*，皆只增不改） */
const EXPECTED_IDS = [
  'env:node',
  'env:git',
  'asset:manifest',
  'asset:hooks',
  'guard:gate',
  'guard:statusline',
  'security:tap',
  'project:cwd',
  'project:changes',
  'project:markers',
  'quality:verify-skills',
  'skills:mandatory',
  'skills:recommended',
  'afk:docker',
  'afk:image',
  'afk:credential-claude-code',
  'afk:credential-codex',
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
  test('全绿基线：17 项检查全 green，exit 0，人读输出含汇总行、无 WARN/FAIL', async () => {
    const deps = makeDeps()
    const code = await cmdDoctor(deps, {})
    expect(code).toBe(0)
    const text = deps.outLines.join('\n')
    expect(text).toContain('[DOCTOR]')
    expect(text).toContain('绿 17')
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
    expect(payload.summary).toEqual({ green: 17, yellow: 0, red: 0 })
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

  test('security:tap 黄灯：tap 正在拦截 → 明示提醒（#34e 敏感能力可见）', async () => {
    const deps = makeDeps({
      doctor: { tapStatus: () => ({ intercepting: true, captureEnabled: true, message: 'tap 正在拦截流量：2 个端口' }) },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'security:tap')
    expect(c.status).toBe('yellow')
    expect(c.detail).toContain('正在拦截')
    expect(c.hint).toContain('不外发')
  })

  test('security:tap 绿灯：未拦截（默认 OFF）', async () => {
    const deps = makeDeps({
      doctor: { tapStatus: () => ({ intercepting: false, captureEnabled: false, message: 'tap 未拦截（默认 OFF）' }) },
    })
    const { payload } = await runJson(deps)
    expect(byId(payload, 'security:tap').status).toBe('green')
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
    expect(payload.summary).toEqual({ green: 17, yellow: 0, red: 0 })
  })
})

describe('doctor —— AFK 运行时就绪四检（full-install R1：afk:docker / afk:image / afk:credential-*）', () => {
  // 缺省 makeDeps 的 afkReadiness = 全就绪（docker 可用/镜像在位/两 runner 凭证已配）→ 四绿基线；
  // 单测只覆写 afkReadiness 返回值制造 docker 缺 / 镜像缺 / 凭证缺 各态。AFK 是可选能力：一律 yellow 不 red。

  test('① docker 不可用 → afk:docker yellow（AFK 可选，降级不阻断 exit 0）;镜像因 docker 缺也 yellow', async () => {
    const deps = makeDeps({
      doctor: {
        afkReadiness: async () => ({
          ok: true as const,
          docker: { available: false },
          image: { configured: 'sandcastle:local', present: false, build_hint: 'bash tools/sandcastle/build.sh' },
          credentials: {
            'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: true, source: 'host-env' as const } },
            codex: { OPENAI_API_KEY: { set: true, source: 'host-env' as const }, CODEX_HOME: { set: false } },
          },
        }),
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0) // yellow 不阻断
    expect(byId(payload, 'afk:docker').status).toBe('yellow')
    expect(byId(payload, 'afk:docker').detail).toContain('docker')
    expect(byId(payload, 'afk:image').status).toBe('yellow')
  })

  test('② docker 在但镜像缺 → afk:image yellow + hint 含 build_hint（bash tools/sandcastle/build.sh）', async () => {
    const deps = makeDeps({
      doctor: {
        afkReadiness: async () => ({
          ok: true as const,
          docker: { available: true },
          image: { configured: 'sandcastle:local', present: false, build_hint: 'bash tools/sandcastle/build.sh' },
          credentials: {
            'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: true, source: 'host-env' as const } },
            codex: { OPENAI_API_KEY: { set: true, source: 'host-env' as const }, CODEX_HOME: { set: true, source: 'host-env' as const } },
          },
        }),
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const c = byId(payload, 'afk:image')
    expect(c.status).toBe('yellow')
    expect(c.detail).toContain('sandcastle:local')
    expect(c.hint).toContain('bash tools/sandcastle/build.sh')
    expect(byId(payload, 'afk:docker').status).toBe('green')
  })

  test('③ 凭证缺 → afk:credential-claude-code / afk:credential-codex 各自 yellow + 去配指引（值永不回显）', async () => {
    const deps = makeDeps({
      doctor: {
        afkReadiness: async () => ({
          ok: true as const,
          docker: { available: true },
          image: { configured: 'sandcastle:local', present: true, build_hint: 'bash tools/sandcastle/build.sh' },
          credentials: {
            'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } },
            codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: false } },
          },
        }),
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    const cc = byId(payload, 'afk:credential-claude-code')
    expect(cc.status).toBe('yellow')
    expect(cc.hint).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    const cx = byId(payload, 'afk:credential-codex')
    expect(cx.status).toBe('yellow')
    expect(cx.hint).toContain('OPENAI_API_KEY')
  })

  test('④ 两 runner 凭证对称:codex 缺席不得——OPENAI_API_KEY 与 CODEX_HOME 都在 codex 灯里呈现', async () => {
    // claude-code 已配、codex 的 OPENAI_API_KEY 已配但 CODEX_HOME 缺 → codex 仍 green（API key 决胜），
    // 但 CODEX_HOME 状态随行在 detail 里可见（对称呈现，不因决胜键已配就隐藏另一键）
    const deps = makeDeps({
      doctor: {
        afkReadiness: async () => ({
          ok: true as const,
          docker: { available: true },
          image: { configured: 'sandcastle:local', present: true, build_hint: 'bash tools/sandcastle/build.sh' },
          credentials: {
            'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: true, source: 'secrets-file' as const } },
            codex: { OPENAI_API_KEY: { set: true, source: 'secrets-file' as const }, CODEX_HOME: { set: false } },
          },
        }),
      },
    })
    const { payload } = await runJson(deps)
    expect(byId(payload, 'afk:credential-claude-code').status).toBe('green')
    const cx = byId(payload, 'afk:credential-codex')
    expect(cx.status).toBe('green')
    expect(cx.detail).toContain('CODEX_HOME') // 对称:CODEX_HOME 恒随行呈现
  })

  test('⑤ 全就绪基线 → afk:* 四项 green', async () => {
    const { payload } = await runJson(makeDeps())
    expect(byId(payload, 'afk:docker').status).toBe('green')
    expect(byId(payload, 'afk:image').status).toBe('green')
    expect(byId(payload, 'afk:credential-claude-code').status).toBe('green')
    expect(byId(payload, 'afk:credential-codex').status).toBe('green')
  })

  test('⑥ 探针自身抛异常 → afk:* 四项各折算 red，不炸命令', async () => {
    const deps = makeDeps({
      doctor: {
        afkReadiness: async () => {
          throw new Error('probe boom')
        },
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1) // red 阻断
    for (const id of ['afk:docker', 'afk:image', 'afk:credential-claude-code', 'afk:credential-codex']) {
      expect(byId(payload, id).status).toBe('red')
      expect(byId(payload, id).detail).toContain('boom')
    }
    expect(payload.checks).toHaveLength(EXPECTED_IDS.length)
  })
})

describe('doctor 缺技能检测（full-install 批2 A1：skills:mandatory / skills:recommended）', () => {
  // registry 走 checkSkills 侧真读 templates/skill-sources.yaml（verify=builtin / openspec-*=bundled 恒在位、
  // token→skill 解析皆真值）；manifest 两表走 manifestSkills mock（缺省 fixture：强制 3 项 / 推荐 1 项，
  // 见 test-support DEFAULT_MANIFEST_SKILLS）。单测只覆写 installedSkillNames / manifestSkills / fileExists。

  test('① 缺某强制 token → skills:mandatory red + hint 含该 token 名 + pipeline setup，exit 1', async () => {
    // 缺 grill-with-docs（只装 search-first）；verify|... 与 opsx:...|... 恒在位
    const deps = makeDeps({ doctor: { installedSkillNames: () => new Set(['search-first']) } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(1)
    const c = byId(payload, 'skills:mandatory')
    expect(c.status).toBe('red')
    expect(c.detail).toContain('grill-with-docs')
    expect(c.hint).toContain('grill-with-docs')
    expect(c.hint).toContain('pipeline setup')
  })

  test('② 缺推荐不缺强制 → mandatory green、recommended yellow（缺名进 detail），exit 0', async () => {
    // 只装 grill-with-docs（缺 search-first）
    const deps = makeDeps({ doctor: { installedSkillNames: () => new Set(['grill-with-docs']) } })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0)
    expect(byId(payload, 'skills:mandatory').status).toBe('green')
    const r = byId(payload, 'skills:recommended')
    expect(r.status).toBe('yellow')
    expect(r.detail).toContain('search-first')
  })

  test('③ 全在位 → 两项 green（缺省基线）', async () => {
    const { payload } = await runJson(makeDeps())
    expect(byId(payload, 'skills:mandatory').status).toBe('green')
    expect(byId(payload, 'skills:recommended').status).toBe('green')
  })

  test('④ builtin/bundled token（verify / openspec-propose）恒算在位——即便 installedSkillNames 全空也不进缺失名单', async () => {
    const deps = makeDeps({ doctor: { installedSkillNames: () => new Set<string>() } })
    const { payload } = await runJson(deps)
    const c = byId(payload, 'skills:mandatory')
    // grill-with-docs 缺 → red；但 verify|verification-loop（builtin）与 opsx:propose|openspec-propose（bundled）不进缺名
    expect(c.status).toBe('red')
    expect(c.detail).toContain('grill-with-docs')
    expect(c.detail).not.toContain('verify')
    expect(c.detail).not.toContain('openspec-propose')
  })

  test('⑤ registry 缺失（fileExists 报无 skill-sources.yaml）→ 两项 yellow 不 green，exit 0（S1 concern #3 回归）', async () => {
    const deps = makeDeps({
      doctor: {
        installedSkillNames: () => new Set<string>(), // 空——若误报 green 才是真 bug
        fileExists: (p) => !p.endsWith('skill-sources.yaml'),
      },
    })
    const { code, payload } = await runJson(deps)
    expect(code).toBe(0) // yellow 不影响 exit（不阻断）
    const m = byId(payload, 'skills:mandatory')
    const r = byId(payload, 'skills:recommended')
    expect(m.status).toBe('yellow')
    expect(r.status).toBe('yellow')
    expect(m.detail).toContain('registry 未就绪')
  })

  test('⑥ a|b 备选任一侧在位即算满足该项（两侧都缺才 red）', async () => {
    // manifest 仅一条强制 a|b：design-taste-frontend|taste-skill（两侧均非 builtin/bundled，逼真考 a|b 逻辑）
    const mk = (installed: string[]) =>
      makeDeps({
        doctor: {
          manifestSkills: () => ({
            mandatory: { build: { frontend: ['design-taste-frontend|taste-skill'] } } as never,
            recommended: {} as never,
          }),
          installedSkillNames: () => new Set(installed),
        },
      })
    expect(byId((await runJson(mk(['taste-skill']))).payload, 'skills:mandatory').status).toBe('green')
    expect(byId((await runJson(mk(['design-taste-frontend']))).payload, 'skills:mandatory').status).toBe('green')
    expect(byId((await runJson(mk([]))).payload, 'skills:mandatory').status).toBe('red')
  })

  test('⑦ manifest 不可用（manifestSkills 返回 null）→ 两项 yellow，不误报 green', async () => {
    const deps = makeDeps({ doctor: { manifestSkills: () => null } })
    const { payload } = await runJson(deps)
    expect(byId(payload, 'skills:mandatory').status).toBe('yellow')
    expect(byId(payload, 'skills:recommended').status).toBe('yellow')
  })

  test('人读输出：缺强制技能 → [FAIL] skills:mandatory + fix: 行含 pipeline setup', async () => {
    const deps = makeDeps({ doctor: { installedSkillNames: () => new Set(['search-first']) } })
    const code = await cmdDoctor(deps, {})
    expect(code).toBe(1)
    const text = deps.outLines.join('\n')
    expect(text).toContain('[FAIL] skills:mandatory')
    expect(text).toMatch(/fix: .*pipeline setup/)
  })
})
