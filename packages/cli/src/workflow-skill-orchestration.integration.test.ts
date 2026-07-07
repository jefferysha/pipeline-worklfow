/**
 * 真实 e2e —— 完整多相位 workflow × skill 编排一体化闭环（GOAL G4 收口，docs/TEST-REALITY.md）。
 *
 * G4 缺口原文：M2 移植的 skills/agents 是 markdown 定义——真实性此前仅由 verify-skills 零悬空
 * + PostToolUse skill-tracker/interactive-gate **各自独立** 真跑（tools/test-hooks.sh section10）
 * 间接覆盖；「真跑一次完整 workflow skill 编排」的 e2e 缺失——没有测试证明这些 hook 在一次真实、
 * 跨越全部 7 相位的流程里彼此咬合（phase transition 真副作用 → gate 真拦 → AskUserQuestion 真解锁
 * → skill 调用真记账 → 下一相位），而只是「每个 hook 单独喂一份手搭 fixture」的隔离拼图。
 *
 * 本文件与既有测试的根本区别：
 *   · packages/cli/src/integration.test.ts 的「全程七相位」用例只走 kernel CLI 侧
 *     （transition/set），从不涉及 hooks/ 下任何 bash 脚本。
 *   · tools/test-hooks.sh section9/10 把 gate/router/skill-tracker/interactive-skill-gate 逐个用
 *     手搭的一次性 fixture 目录喂一次 stdin JSON，互不 relay，同一次运行里没有一个真实活跃
 *     change 会跨越多个相位演进。
 *   · 本文件把两者接到同一个真实项目目录上：真 kernel/CLI 驱动 open→archive 全部 7 次相位转移，
 *     每个相位真调用该相位在 templates/manifest.yaml 派生的 mandatory_skills（backend track，
 *     经真 loadManifest + skillsFor 三级回退读出，非硬编码猜测 skill 名单），每次 Skill 调用
 *     严格按真实 PreToolUse→PostToolUse 顺序真跑 hooks/gate.sh → hooks/skill-tracker.sh →
 *     hooks/interactive-skill-gate.sh；命中新鲜 marker（真实陈述——由 review-phase 转移或
 *     interactive skill 落下，皆非测试手搭）就真触发一次 AskUserQuestion 的两个 PostToolUse
 *     hook（confirm-clear.sh + decision-recorder.sh）解锁，再复检 gate 真放行。全程只有一个真实
 *     openspec/changes/<name>/.pipeline-history.jsonl，kernel 侧（transition/set）与 hooks 侧
 *     （tool/prompt）写入同一份文件、真实交替 append，用文件内真实行序核验因果一致（非仅计数）。
 *
 * 零 mock：真 bash 子进程（hooks/*.sh，spawnSync，同 tools/test-hooks.sh 的驱动方式）+ 真
 * kernel/CLI（复用 integration-harness.ts 的 freshHarness，同 integration.test.ts 装配）+
 * 真 fs（mkdtemp 临时项目）+ 真 manifest 派生（loadManifest/skillsFor，非硬编码 skill 名单）。
 *
 * 刻意不覆盖（诚实边界，非疏漏）：
 *   · SessionStart（session-start.sh）/ UserPromptSubmit 的 breadcrumb.sh——两者是低频会话
 *     前言，已由 tools/test-hooks.sh 独立真跑覆盖，与本文件聚焦的「skill 调用编排链」正交。
 *   · .pipeline-pending-confirm 门：当前仓库内没有任何代码路径会真实创建它（只有 gate.sh 读它、
 *     confirm-clear.sh 清它）——是"是否进 pipeline"这一更早决策点的钩子，本流程从 init 之后即
 *     有活跃 change，天然不会触发它；tools/test-hooks.sh 已用手搭 marker 验证 gate.sh 对它的
 *     处理，无需在此重复。
 *   · `pipeline transition/set` 等 CLI 子命令调用本身不经过 PreToolUse gate.sh——那是 Claude
 *     Code 包住 Bash/Edit/Write/Skill/MultiEdit 等"agent 工具调用"的钩子，不包 pipeline 二进制
 *     的内部子命令分派；既有 integration.test.ts 全部用例均按此边界处理，本文件保持一致。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { loadManifest, skillsFor, type Phase } from '@pipeline-lite/kernel'
import { freshHarness, MANIFEST, REPO_ROOT, rm, type Harness } from './integration-harness.js'

const TRACK = 'backend' as const
const CHANGE = 'wfskill'

interface HookResult { code: number; stdout: string; stderr: string }
interface HistLine { ts: string; kind: string; to?: string; raw?: string; field?: string }

/** 真调用一个 hooks/*.sh（同 tools/test-hooks.sh 的驱动方式：bash 显式解释器 + stdin JSON）。
 *  强制清 PIPELINE_AFK（AFK 逃生门会让 gate.sh 无条件放行——若外层环境意外带了这个变量，
 *  会让本文件的门禁断言假绿，不能依赖外层 shell 干净，必须显式清空）。 */
function runHook(script: string, payload: unknown, extraEnv: Record<string, string> = {}): HookResult {
  const env = { ...process.env, ...extraEnv }
  delete env.PIPELINE_AFK
  const res = spawnSync('bash', [join(REPO_ROOT, 'hooks', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env,
  })
  if (res.error) throw res.error
  return { code: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

/** manifest skill token（如 'opsx:explore|openspec-explore'）解析成本仓真实会调用的具体名字：
 *  优先取本地真有 SKILL.md 的备选（真查文件系统，非猜测）；否则回退首个备选（外部 skill 形态，
 *  由 EXTERNAL-SKILLS.md 声明覆盖，见下方 verify-skills 一致性用例）。 */
function resolveSkillToken(token: string): string {
  const alts = token.split('|')
  for (const alt of alts) {
    if (existsSync(join(REPO_ROOT, 'skills', alt, 'SKILL.md'))) return alt
  }
  return alts[0] ?? token
}

/** skill 名的"去 plugin 前缀"裸名（对齐 interactive-skill-gate.sh 的 SKILL_BASE="${SKILL##*:}"）。 */
function skillBase(name: string): string {
  const i = name.lastIndexOf(':')
  return i >= 0 ? name.slice(i + 1) : name
}

/** 交互式 skill 清单——直接从真实 hooks/interactive-skill-gate.sh 源码正则抽取（单一真相源，
 *  防止本测试的清单与 hook 实际清单脱节漂移，同 router 段"缓存派生自真实 manifest"的做法）。 */
function loadInteractiveSkillSet(): ReadonlySet<string> {
  const src = readFileSync(join(REPO_ROOT, 'hooks', 'interactive-skill-gate.sh'), 'utf8')
  const m = src.match(/^INTERACTIVE_SKILLS="([^"]*)"/m)
  if (!m) throw new Error('未能从 interactive-skill-gate.sh 提取 INTERACTIVE_SKILLS（脚本格式是否变了？）')
  return new Set((m[1] ?? '').split(/\s+/).filter(Boolean))
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

describe('真实 e2e —— 完整多相位 workflow × skill 编排一体化闭环（G4）', () => {
  let h: Harness
  let changeDir: string
  let historyPath: string
  let routerCache: string
  const manifest = loadManifest(MANIFEST)
  const interactiveSkills = loadInteractiveSkillSet()

  let unlockCount = 0
  let toolCount = 0

  beforeEach(async () => {
    h = await freshHarness()
    changeDir = join(h.cwd, 'openspec/changes', CHANGE)
    historyPath = join(changeDir, '.pipeline-history.jsonl')
    // 隔离缓存路径：避免撞车开发机真实 ~/.claude 缓存，也避免与并行跑的其它测试文件/agent 竞争
    routerCache = join(h.cwd, '.router-cache.generated.sh')
    unlockCount = 0
    toolCount = 0
  })

  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  async function seed(rel: string, content = '# doc\n'): Promise<void> {
    const p = join(h.cwd, rel)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, content, 'utf8')
  }

  async function historyLines(): Promise<HistLine[]> {
    const raw = await readFile(historyPath, 'utf8').catch(() => '')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as HistLine)
  }

  function runRouter(prompt: string): HookResult {
    return runHook('router.sh', { prompt, cwd: h.cwd }, { CLAUDE_PLUGIN_ROOT: REPO_ROOT, PIPELINE_ROUTER_CACHE: routerCache })
  }

  /**
   * 真模拟一次 Skill 工具调用的完整生命周期：
   *   ① PreToolUse gate.sh 真检查（新鲜 marker 就真拦 exit 2）
   *   ② 拦住就真模拟一次 AskUserQuestion（PostToolUse confirm-clear.sh + decision-recorder.sh）
   *      解锁，复检真放行
   *   ③ 放行后真触发这次 Skill 调用的 PostToolUse 对（skill-tracker.sh + interactive-skill-gate.sh）
   * 断言每一步的真实副作用（marker 文件真删/真建、JSONL 真 append 恰一行且内容含 skill 名）。
   */
  async function invokeSkillThroughGate(
    phase: Phase,
    rawToken: string,
  ): Promise<{ resolved: string; interactive: boolean; wasBlocked: boolean }> {
    const resolved = resolveSkillToken(rawToken)
    const interactive = interactiveSkills.has(skillBase(resolved)) || interactiveSkills.has(resolved)

    let gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill' })
    let wasBlocked = false
    if (gate.code === 2) {
      wasBlocked = true
      unlockCount++
      expect(gate.stderr, `gate 拦截应指引 AskUserQuestion（${phase}/${resolved}）`).toContain('AskUserQuestion')
      const beforeLen = (await historyLines()).length
      const ask = {
        cwd: h.cwd,
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: `[${phase}] 即将调用 ${resolved}，门已拦截，确认继续？`, header: '继续' }] },
        tool_response: { answers: { 继续: '继续' } },
      }
      const cc = runHook('confirm-clear.sh', ask)
      expect(cc.code, 'confirm-clear 应 exit 0').toBe(0)
      const dr = runHook('decision-recorder.sh', ask)
      expect(dr.code, 'decision-recorder 应 exit 0').toBe(0)
      const afterLines = await historyLines()
      expect(afterLines.length, 'decision-recorder 应真 append 恰一行').toBe(beforeLen + 1)
      const last = afterLines[afterLines.length - 1]
      expect(last?.kind).toBe('prompt')
      expect(last?.raw ?? '').toContain(resolved)

      gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill' })
      expect(gate.code, `AskUserQuestion 后 gate 应放行（${phase}/${resolved}）`).toBe(0)
    } else {
      expect(gate.code, `无新鲜 marker 时 gate 应直接放行（${phase}/${resolved}）`).toBe(0)
    }

    // 门已放行 → 真触发这次 Skill 调用的 PostToolUse 对（同 hooks.json 登记顺序：skill-tracker 先、interactive-skill-gate 后）
    const beforeToolLen = (await historyLines()).length
    const skillPayload = { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: resolved } }
    const tracker = runHook('skill-tracker.sh', skillPayload)
    expect(tracker.code, `skill-tracker 应 exit 0（${resolved}）`).toBe(0)
    const afterToolLines = await historyLines()
    expect(afterToolLines.length, 'skill-tracker 应真 append 恰一行').toBe(beforeToolLen + 1)
    const lastTool = afterToolLines[afterToolLines.length - 1]
    expect(lastTool?.kind).toBe('tool')
    expect(lastTool?.raw ?? '').toContain(resolved)
    toolCount++

    const gateHook = runHook('interactive-skill-gate.sh', skillPayload)
    expect(gateHook.code, `interactive-skill-gate 应 exit 0（${resolved}）`).toBe(0)
    if (interactive) {
      const parsed = JSON.parse(gateHook.stdout.trim()) as { additionalContext?: string }
      expect(parsed.additionalContext, `交互式 skill ${resolved} 应注入姿态`).toContain(resolved)
      expect(await pathExists(join(h.cwd, '.pipeline-pending-interaction')), `交互式 skill ${resolved} 应落硬门`).toBe(true)
    } else {
      expect(gateHook.stdout.trim(), `非交互式 skill ${resolved} 不应注入`).toBe('')
    }

    return { resolved, interactive, wasBlocked }
  }

  /** 走完一个相位在 backend track 下 manifest 真派生的全部 mandatory skill（skillsFor 三级回退，
   *  非硬编码——manifest.yaml 改了这里自动跟着变，回归锚同 manifest-derive.test.ts 的单一真相源原则）。 */
  async function runMandatorySkillsForPhase(phase: Phase): Promise<void> {
    for (const token of skillsFor(manifest.mandatorySkills, phase, TRACK)) {
      await invokeSkillThroughGate(phase, token)
    }
  }

  test('7 相位真转移 × manifest 真派生 skill 全量调用 × 真 gate veto/unlock × 单一 JSONL 因果一致', async () => {
    // ── phase=open：init 落地，尚无任何 marker，mandatory skill 应直接放行（无需解锁）──
    expect(await h.run(['init', CHANGE, '--track', TRACK, '--preset', 'full', '--user', 'e2e'])).toBe(0)
    expect(await h.read(CHANGE)).toMatch(/^phase: open$/m)
    let r = runRouter('设计一个后端 API 接口，接 Postgres 数据库，写 service 层')
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('track=backend')
    expect(r.stdout).toContain('phase=open')
    expect(r.stdout).toContain(CHANGE)
    await runMandatorySkillsForPhase('open')

    // ── open-complete → explore（review 相位，真落 review marker）──
    expect(await h.run(['transition', CHANGE, 'open-complete'])).toBe(0)
    expect(await pathExists(join(h.cwd, '.pipeline-pending-review'))).toBe(true)
    r = runRouter('继续深入这个后端 API 的调研和设计')
    expect(r.stdout).toContain('phase=explore')
    await runMandatorySkillsForPhase('explore')
    // interaction 门是共享状态、非 per-tool-type——explore 全部 skill 走完（含 2 个交互式 skill 各自
    // 落门又被解锁）后，门应彻底清空，任意工具类型（这里探 Bash，不仅 Skill）都应真放行
    const bashProbe = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Bash' })
    expect(bashProbe.code, 'explore 全部 skill 走完后门应清空，Bash 也应放行').toBe(0)
    await seed(`openspec/changes/${CHANGE}/design.md`, '# design\n覆盖矩阵齐全\n')
    expect(await h.run(['set', CHANGE, 'design_doc', `openspec/changes/${CHANGE}/design.md`])).toBe(0)

    // ── explore-complete → spec（review 相位）──
    expect(await h.run(['transition', CHANGE, 'explore-complete'])).toBe(0)
    expect(await pathExists(join(h.cwd, '.pipeline-pending-review'))).toBe(true)
    r = runRouter('继续实现这个后端 service 层的 API 落地')
    expect(r.stdout).toContain('phase=spec')
    await runMandatorySkillsForPhase('spec')
    await seed(`openspec/changes/${CHANGE}/plan.md`, '# plan\n')
    expect(await h.run(['set', CHANGE, 'plan', `openspec/changes/${CHANGE}/plan.md`])).toBe(0)

    // ── spec-complete → build（非 review 相位，不落 marker——skill 应全程无阻）──
    expect(await h.run(['transition', CHANGE, 'spec-complete'])).toBe(0)
    expect(await pathExists(join(h.cwd, '.pipeline-pending-review'))).toBe(false)
    r = runRouter('继续写这个后端 API 的 service 层实现')
    expect(r.stdout).toContain('phase=build')
    await runMandatorySkillsForPhase('build')
    expect(await h.run(['set-many', CHANGE, 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])).toBe(0)

    // ── build-complete → verify（review 相位）──
    expect(await h.run(['transition', CHANGE, 'build-complete'])).toBe(0)
    expect(await pathExists(join(h.cwd, '.pipeline-pending-review'))).toBe(true)
    await runMandatorySkillsForPhase('verify')
    await seed(`openspec/changes/${CHANGE}/verify.md`, '# verify\n')
    expect(
      await h.run([
        'set-many',
        CHANGE,
        `verification_report=openspec/changes/${CHANGE}/verify.md`,
        'branch_status=handled',
        'agent_review_result=pass',
        'codex_review_result=pass',
      ]),
    ).toBe(0)

    // ── verify-pass → ship（非 review 相位）──
    expect(await h.run(['transition', CHANGE, 'verify-pass'])).toBe(0)
    r = runRouter('准备把这个后端服务的 API 发布上线')
    expect(r.stdout).toContain('phase=ship')
    await runMandatorySkillsForPhase('ship')

    // ── ship-complete → archive；archived 事件收尾 ──
    expect(await h.run(['transition', CHANGE, 'ship-complete'])).toBe(0)
    expect(await h.run(['transition', CHANGE, 'archived'])).toBe(0)
    expect(await h.read(CHANGE)).toMatch(/^phase: archive$/m)
    expect(await h.read(CHANGE)).toMatch(/^archived: true$/m)

    // 归档后 router 不再把它算作"活跃 change"（真读 archived:true 字段的真实行为，非猜测）
    r = runRouter('继续这个后端服务的收尾')
    expect(r.stdout).toContain('尚无活跃 change')
    expect(r.stdout).not.toContain(CHANGE)

    // ── 单一 JSONL 真相源的因果一致性（同一份文件里 kernel 侧 transition/set 与 hooks 侧 tool/prompt 真交替）──
    const parsed = await historyLines()
    for (const line of parsed) {
      expect(['init', 'set', 'transition', 'tool', 'prompt', 'import']).toContain(line.kind)
    }
    const transitions = parsed.filter((p) => p.kind === 'transition')
    const tools = parsed.filter((p) => p.kind === 'tool')
    const prompts = parsed.filter((p) => p.kind === 'prompt')
    expect(transitions.map((t) => t.to)).toEqual(['explore', 'spec', 'build', 'verify', 'ship', 'archive', 'archive'])
    // 自洽核验：JSONL 里落盘的行数必须等于流程里实际触发的次数（防「hook 声称 append 了但文件没有」这类假绿）
    expect(tools).toHaveLength(toolCount)
    expect(prompts).toHaveLength(unlockCount)
    // 与当前真实 manifest.yaml 的锚点（backend track 全 7 相位 mandatory_skills 求和）——manifest 改了
    // 这两个数会跟着变，届时需要人工确认是有意变化（同 manifest-derive.test.ts 的单源回归锚哲学）
    expect(toolCount).toBe(13)
    expect(unlockCount).toBe(5)

    // 行序因果核验（非仅计数）：每个相位区间内的 tool/prompt 条数必须落在该相位真实转移事件之间
    const idx = (to: string) => parsed.findIndex((p) => p.kind === 'transition' && p.to === to)
    const seg = (a: number, b: number) => parsed.slice(a + 1, b)
    const idxExplore = idx('explore')
    const idxSpec = idx('spec')
    const idxBuild = idx('build')
    const idxVerify = idx('verify')
    const idxShip = idx('ship')
    const idxArchive = idx('archive')
    expect(parsed.slice(0, idxExplore).filter((p) => p.kind === 'tool')).toHaveLength(1) // open 阶段 1 个 mandatory skill
    expect(seg(idxExplore, idxSpec).filter((p) => p.kind === 'tool')).toHaveLength(4)
    expect(seg(idxExplore, idxSpec).filter((p) => p.kind === 'prompt')).toHaveLength(3)
    expect(seg(idxSpec, idxBuild).filter((p) => p.kind === 'tool')).toHaveLength(2)
    expect(seg(idxSpec, idxBuild).filter((p) => p.kind === 'prompt')).toHaveLength(1)
    expect(seg(idxBuild, idxVerify).filter((p) => p.kind === 'tool')).toHaveLength(2)
    expect(seg(idxBuild, idxVerify).filter((p) => p.kind === 'prompt')).toHaveLength(0) // build 非 review 相位，全程不该有解锁
    expect(seg(idxVerify, idxShip).filter((p) => p.kind === 'tool')).toHaveLength(1)
    expect(seg(idxVerify, idxShip).filter((p) => p.kind === 'prompt')).toHaveLength(1)
    expect(seg(idxShip, idxArchive).filter((p) => p.kind === 'tool')).toHaveLength(3)
    expect(seg(idxShip, idxArchive).filter((p) => p.kind === 'prompt')).toHaveLength(0) // ship 非 review 相位，全程不该有解锁
  }, 30_000)

  test('kernel 真产出的 review marker 陈旧超 TTL 后，gate.sh 真自愈放行（无需 AskUserQuestion）', async () => {
    expect(await h.run(['init', CHANGE, '--track', TRACK, '--preset', 'full'])).toBe(0)
    expect(await h.run(['transition', CHANGE, 'open-complete'])).toBe(0) // → explore，真落 review marker
    const markerPath = join(h.cwd, '.pipeline-pending-review')
    expect(await pathExists(markerPath)).toBe(true)
    // 真把这个刚由 kernel 写下的真实 marker 的 mtime 打到 TTL（1800s）之外——不是手搭一个假 marker，
    // 是回拨 transition 命令真实产出的那个文件，验证 TTL 衰减逻辑与真实产物的接合处
    const old = new Date(Date.now() - (30 * 60 * 1000 + 5_000))
    await utimes(markerPath, old, old)
    const gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill' })
    expect(gate.code, '陈旧 review marker 应视为不新鲜，直接放行').toBe(0)
    expect(await pathExists(markerPath), 'gate.sh 应顺手真删陈旧 marker').toBe(false)
  })
})

describe('真实 e2e —— verify-skills 零悬空覆盖本编排实际驱动的每个 skill 名（G4 收口的直接串联）', () => {
  test('本次编排用到的每个 backend track mandatory skill，真名要么本地有 SKILL.md，要么在 EXTERNAL-SKILLS.md 声明', () => {
    const manifest = loadManifest(MANIFEST)
    const externalManifest = readFileSync(join(REPO_ROOT, 'skills', 'EXTERNAL-SKILLS.md'), 'utf8')
    const phases: Phase[] = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']
    const used = new Set<string>()
    for (const phase of phases) {
      for (const token of skillsFor(manifest.mandatorySkills, phase, TRACK)) {
        used.add(resolveSkillToken(token))
      }
    }
    expect(used.size).toBeGreaterThan(0)
    for (const name of used) {
      const coveredLocally = existsSync(join(REPO_ROOT, 'skills', name, 'SKILL.md'))
      const coveredExternally = externalManifest.includes(`- ${name}`)
      expect(coveredLocally || coveredExternally, `skill "${name}" 既非本地 SKILL.md 也未在 EXTERNAL-SKILLS.md 声明——悬空引用`).toBe(true)
    }
  })

  test('tools/verify-skills.sh 真跑全仓：零悬空引用（复用既有工具，而非在此重新实现校验逻辑）', () => {
    const res = spawnSync('bash', [join(REPO_ROOT, 'tools', 'verify-skills.sh'), '--root', REPO_ROOT], { encoding: 'utf8' })
    expect(res.status, `verify-skills 应 exit 0；stderr=${res.stderr}`).toBe(0)
    expect(res.stdout).toContain('OK')
  })
})
