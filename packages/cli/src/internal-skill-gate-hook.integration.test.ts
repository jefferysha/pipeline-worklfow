/**
 * 真实 e2e —— hooks/gate.sh 对非 default workflow 的 skill DAG 委托分支（Task 9，GOAL 清单 E）。
 *
 * 只验证 gate.sh 这条新分支本身的接线是否正确（真 bash 子进程 + 真 dist bundle + 真 CLI 落盘 +
 * 真 skill-tracker.sh 记账），不重复 internalSkillGate.test.ts 已经用 mock deps 覆盖过的
 * isSkillUnlocked 判定细节（依赖 DAG 各种组合、"最近一次进入 step" 扫描语义等）——这里只关心
 * "gate.sh 在正确的时机委托、在错误的时机绝不委托，且退出码正确传导"。
 *
 * 依赖 packages/cli/dist/pipeline.mjs 是最新构建（gate.sh 生产路径 spawn 的就是这个 bundle）；
 * 本文件不负责触发构建，运行前需先 `npm run build`（同 tools/test-hooks.sh 对 dist 的既有假设，
 * 见该文件 §3 红线自证段的说明）。
 */
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, REPO_ROOT, rm, type Harness } from './integration-harness.js'

const CHANGE = 'skg'

interface HookResult { code: number; stdout: string; stderr: string }

/** 真调用一个 hooks/*.sh（同 workflow-skill-orchestration.integration.test.ts 的驱动方式）。
 *  显式钉死 CLAUDE_PLUGIN_ROOT=REPO_ROOT（而非依赖 gate.sh 内 BASH_SOURCE 兜底）：本文件新增
 *  的分支第一次让 gate.sh 依赖 PLUGIN_ROOT 定位 dist bundle，若测试运行环境恰好残留了别的
 *  CLAUDE_PLUGIN_ROOT（例如本文件本身就跑在一个真实 Claude Code 会话里），不钉死会让 gate.sh
 *  误往其它安装位置找 bundle，产生环境相关的假红/假绿。强制清 PIPELINE_AFK（同款理由：AFK
 *  逃生门会让 gate.sh 无条件放行，不能依赖外层 shell 干净）。 */
function runHook(script: string, payload: unknown, extraEnv: Record<string, string> = {}): HookResult {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...extraEnv }
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

/** 一个最小单 step workflow：s1 声明一个依赖同 step 内 'a' 的 skill 'needs-a'（无出边，本文件
 *  不测 transition）。'a' 必须作为 s1 自己的 skills 列表里的独立条目声明（即便它自己没有
 *  depends_on）——`validateWorkflow`（Task 3，GOAL E5）硬性要求 depends_on 只能引用同一个
 *  step 内已声明的 skill id，此前这里省略了 'a' 的独立声明，`loadWorkflow` 尚未接入校验时
 *  这个 fixture 能"恰好跑通"（isSkillUnlocked 只关心 completedSinceStepEntry 集合里有没有
 *  'a'，从不检查 'a' 是否被声明），接入校验后会被真实拒绝为悬空引用——修正为同
 *  parse.test.ts 的合法写法，不改变本文件任何一条断言（都只查询 'needs-a'，从不查询 'a'
 *  自身是否解锁）。 */
const WF = `name: skgwf
steps:
  - id: s1
    label: step-one
    gate: null
    skills:
      - id: a
      - id: needs-a
        depends_on: [a]
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

describe('真实 e2e —— hooks/gate.sh 委托 internal-skill-gate（Task 9）', () => {
  let h: Harness

  beforeEach(async () => {
    h = await freshHarness()
  })

  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  /** 真落 workflow 定义文件 + 真跑 `init --workflow` 把 change 直接摆到自定义 workflow 的
   *  首个 step 上（whole-branch review 补的 init --workflow，见
   *  init-workflow.integration.test.ts——此前这里手改 .pipeline.yaml 的 phase 行，因为
   *  `set phase` 被默认 7 相位枚举挡下，现在有了一条不必绕开它的路）。 */
  async function setupCustomChange(): Promise<void> {
    const wfDir = join(h.cwd, '.pipeline', 'workflows')
    await mkdir(wfDir, { recursive: true })
    await writeFile(join(wfDir, 'skgwf.yaml'), WF, 'utf8')
    expect(await h.run(['init', CHANGE, '--track', 'backend', '--preset', 'full', '--workflow', 'skgwf'])).toBe(0)
  }

  test('init 落地的 change 缺省 workflow: default（回归锚，防 gate.sh 的 yget 解析假设漂移）', async () => {
    expect(await h.run(['init', CHANGE, '--track', 'backend', '--preset', 'full'])).toBe(0)
    expect(await h.read(CHANGE)).toMatch(/^workflow: default$/m)
  })

  test('workflow=default + Skill 调用 → gate 直接放行，不受本机制影响', async () => {
    expect(await h.run(['init', CHANGE, '--track', 'backend', '--preset', 'full'])).toBe(0)
    const gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: 'needs-a' } })
    expect(gate.code, `stderr=${gate.stderr}`).toBe(0)
  })

  test('workflow=default → 全程零 spawn node（PATH 换成"毒丸" node，真调用会被立刻抓到）', async () => {
    expect(await h.run(['init', CHANGE, '--track', 'backend', '--preset', 'full'])).toBe(0)
    const poisonDir = await mkdtemp(join(tmpdir(), 'poison-node-'))
    await writeFile(join(poisonDir, 'node'), '#!/usr/bin/env bash\nprintf \'POISONED\\n\' >&2\nexit 99\n', 'utf8')
    await chmod(join(poisonDir, 'node'), 0o755)
    const gate = runHook(
      'gate.sh',
      { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: 'needs-a' } },
      { PATH: `${poisonDir}:${process.env.PATH ?? ''}` },
    )
    expect(gate.code, `stderr=${gate.stderr}`).toBe(0)
    expect(gate.stderr).not.toContain('POISONED')
    await rm(poisonDir, { recursive: true, force: true })
  })

  test('非 default workflow + 非 Skill 调用（Bash）→ 即便当前 step 的 skill 被锁定也不受影响', async () => {
    await setupCustomChange()
    const gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Bash' })
    expect(gate.code, `stderr=${gate.stderr}`).toBe(0)
  })

  test('非 default workflow + Skill 调用 + 依赖未满足 → gate 真拦截 exit 2，stderr 点名依赖', async () => {
    await setupCustomChange()
    const gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: 'needs-a' } })
    expect(gate.code, `stderr=${gate.stderr}`).toBe(2)
    expect(gate.stderr).toContain('needs-a')
    expect(gate.stderr).toContain('a')
  })

  test('非 default workflow + Skill 调用 + 依赖已满足（真跑 skill-tracker.sh 记一次 a）→ gate 真放行', async () => {
    await setupCustomChange()
    // 真触发一次 skill-tracker.sh（同 workflow-skill-orchestration.integration.test.ts 的驱动
    // 方式），让依赖 "a" 的完成记录真落进 .pipeline-history.jsonl，而非手搭 fixture 绕过真实
    // 写入路径——本行连带验证了 internalSkillGate.ts 对 raw="Skill: a" 前缀格式的解析假设
    // 与 skill-tracker.sh 的真实落盘格式一致（这条假设在 mock 单测里没有真落盘可验证）。
    const tracker = runHook('skill-tracker.sh', { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: 'a' } })
    expect(tracker.code, `skill-tracker stderr=${tracker.stderr}`).toBe(0)
    const histPath = join(h.cwd, 'openspec', 'changes', CHANGE, '.pipeline-history.jsonl')
    expect(await readFile(histPath, 'utf8')).toContain('"raw":"Skill: a"')

    const gate = runHook('gate.sh', { cwd: h.cwd, tool_name: 'Skill', tool_input: { skill: 'needs-a' } })
    expect(gate.code, `stderr=${gate.stderr}`).toBe(0)
  })
})
