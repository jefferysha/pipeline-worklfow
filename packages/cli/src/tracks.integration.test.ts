/**
 * `pipeline tracks list/show/create/update/delete` e2e —— 真 kernel + 真临时 fs（GOAL.md T-R3）。
 * 覆盖：list builtin-only 顺序 / show 三 source / create·update·delete 人读+JSON / option 互斥·
 * 无 patch·未知 id·builtin 禁改删 exit 1 / 引用完整性（有引用拒·fail-closed·缩 allowed 拒·改 label
 * 放行·archive 排除）/ CRUD 后同进程下次 init 看到新 registry（防 memoization 回归）/ 首次 create
 * 生成 version:1 且四轨不必完整写入。
 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildProgram, CliExit } from './program.js'
import { freshHarness, realDeps, type Harness } from './integration-harness.js'

/** 最小合法自定义 workflow（首 step=draft），供 allowed 白名单引用真实存在。 */
function workflowYaml(id: string): string {
  return `name: ${id}
steps:
  - id: draft
    label: draft
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: done
  - id: done
    label: done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`
}

async function writeWorkflow(cwd: string, id: string): Promise<void> {
  await mkdir(join(cwd, '.pipeline', 'workflows'), { recursive: true })
  await writeFile(join(cwd, '.pipeline', 'workflows', `${id}.yaml`), workflowYaml(id), 'utf8')
}

const CREATE_DATA = ['tracks', 'create', 'data', '--label', 'Data', '--workflow-default', 'default', '--workflow-any', '--policy', 'chat']

describe('pipeline tracks —— list/show（只读）', () => {
  let h: Harness
  beforeEach(async () => { h = await freshHarness() })
  afterEach(async () => { await rm(h.cwd, { recursive: true, force: true }) })

  test('list（无 tracks.yaml）：固定列 + 内建四轨固定序，纯 stdout', async () => {
    expect(await h.run(['tracks', 'list'])).toBe(0)
    expect(h.out[0]).toMatch(/^ID\s+LABEL\s+BUILTIN\s+DEFAULT\s+ALLOWED\s+POLICY/)
    expect(h.out.slice(1).map((l) => l.split(/\s+/)[0])).toEqual(['chat', 'pm', 'frontend', 'backend'])
    expect(h.err).toEqual([])
  })

  test('list --json：array 4 条、schema 完整、纯 stdout', async () => {
    expect(await h.run(['tracks', 'list', '--json'])).toBe(0)
    expect(h.out).toHaveLength(1)
    const arr = JSON.parse(h.out[0]!)
    expect(arr).toHaveLength(4)
    expect(arr.map((t: { id: string }) => t.id)).toEqual(['chat', 'pm', 'frontend', 'backend'])
    for (const t of arr) {
      expect(t).toMatchObject({ builtin: true, source: 'builtin' })
      expect(Object.keys(t)).toEqual(expect.arrayContaining(['id', 'label', 'builtin', 'workflow', 'policyProfile', 'revision']))
    }
  })

  test('show chat：人读 source: builtin；--json source builtin', async () => {
    expect(await h.run(['tracks', 'show', 'chat'])).toBe(0)
    expect(h.out).toContain('source: builtin')
    expect(await h.run(['tracks', 'show', 'chat', '--json'])).toBe(0)
    expect(JSON.parse(h.out[0]!)).toMatchObject({ id: 'chat', source: 'builtin', builtin: true })
  })

  test('show 未知 id → exit 1', async () => {
    expect(await h.run(['tracks', 'show', 'ghost'])).toBe(1)
    expect(h.err.join('\n')).toContain("未注册的 track 'ghost'")
  })

  test('bare tracks（无子命令）→ usage exit 1', async () => {
    expect(await h.run(['tracks'])).toBe(1)
    expect(h.err.join('\n')).toContain('用法：pipeline tracks')
  })
})

describe('pipeline tracks —— create', () => {
  let h: Harness
  beforeEach(async () => { h = await freshHarness() })
  afterEach(async () => { await rm(h.cwd, { recursive: true, force: true }) })

  test('首次 create：exit 0、stdout `created data`、tracks.yaml version:1 且四轨不必完整写入', async () => {
    expect(await h.run(CREATE_DATA)).toBe(0)
    expect(h.out).toContain('created data')
    const yaml = await readFile(join(h.cwd, '.pipeline', 'tracks.yaml'), 'utf8')
    expect(yaml.startsWith('version: 1\n')).toBe(true)
    expect(yaml).not.toContain('chat') // 内建轨无需完整复制进文件
    expect(yaml).toContain('id: data')
    // list 现 5 条、data 在末尾、source custom
    expect(await h.run(['tracks', 'list'])).toBe(0)
    expect(h.out.slice(1).map((l) => l.split(/\s+/)[0])).toEqual(['chat', 'pm', 'frontend', 'backend', 'data'])
    expect(await h.run(['tracks', 'show', 'data'])).toBe(0)
    expect(h.out).toContain('source: custom')
  })

  test('create --json → effective definition（含 revision）', async () => {
    expect(await h.run([...CREATE_DATA, '--json'])).toBe(0)
    expect(h.out).toHaveLength(1)
    expect(JSON.parse(h.out[0]!)).toMatchObject({ id: 'data', builtin: false, source: 'custom' })
    expect(JSON.parse(h.out[0]!).revision).toBeTruthy()
  })

  test('缺必填（--label）→ exit 1', async () => {
    expect(await h.run(['tracks', 'create', 'x', '--workflow-default', 'default', '--workflow-any', '--policy', 'chat'])).toBe(1)
    expect(h.err.join('\n')).toContain('缺少必填项')
  })

  test('--workflow-any 与 --workflow-allowed 同传 → 互斥 exit 1', async () => {
    expect(await h.run(['tracks', 'create', 'x', '--label', 'X', '--workflow-default', 'default', '--workflow-any', '--workflow-allowed', 'default', '--policy', 'chat'])).toBe(1)
    expect(h.err.join('\n')).toContain('互斥')
  })

  test('撞已有 custom → exit 1；撞内建 → exit 1', async () => {
    expect(await h.run(CREATE_DATA)).toBe(0)
    expect(await h.run(CREATE_DATA)).toBe(1)
    expect(h.err.join('\n')).toContain('已存在')
    expect(await h.run(['tracks', 'create', 'backend', '--label', 'B', '--workflow-default', 'default', '--workflow-any', '--policy', 'chat'])).toBe(1)
    expect(h.err.join('\n')).toContain('内建')
  })

  test('未知 --policy → exit 1', async () => {
    expect(await h.run(['tracks', 'create', 'x', '--label', 'X', '--workflow-default', 'default', '--workflow-any', '--policy', 'bogus'])).toBe(1)
    expect(h.err.join('\n')).toContain("未知 --policy 'bogus'")
  })
})

describe('pipeline tracks —— update（builtin 可变面 + 归一化）', () => {
  let h: Harness
  beforeEach(async () => { h = await freshHarness() })
  afterEach(async () => { await rm(h.cwd, { recursive: true, force: true }) })

  test('改 builtin label → source builtin-override + override 行；改回默认 → 归一化 source builtin', async () => {
    expect(await h.run(['tracks', 'update', 'chat', '--set-label', '会话'])).toBe(0)
    expect(h.out).toContain('updated chat')
    expect(await h.run(['tracks', 'show', 'chat'])).toBe(0)
    expect(h.out).toContain('source: builtin-override')
    expect(h.out).toContain('override: label=会话')
    // 改回代码默认 → 覆盖层清空 → source 回 builtin
    expect(await h.run(['tracks', 'update', 'chat', '--set-label', 'Chat'])).toBe(0)
    expect(await h.run(['tracks', 'show', 'chat'])).toBe(0)
    expect(h.out).toContain('source: builtin')
    expect(h.out).not.toContain('override:')
  })

  test('builtin --set-policy → exit 1（policy 锁死）', async () => {
    expect(await h.run(['tracks', 'update', 'chat', '--set-policy', 'pm'])).toBe(1)
    expect(h.err.join('\n')).toContain('policyProfile')
  })

  test('update 无任何 --set-* → exit 1', async () => {
    expect(await h.run(['tracks', 'update', 'chat'])).toBe(1)
    expect(h.err.join('\n')).toContain('至少需要一个 --set-')
  })

  test('update 未知 id → exit 1（not-found）', async () => {
    expect(await h.run(['tracks', 'update', 'ghost', '--set-label', 'X'])).toBe(1)
    expect(h.err.join('\n')).toContain("track 'ghost' 不存在")
  })
})

describe('pipeline tracks —— delete + 引用完整性', () => {
  let h: Harness
  beforeEach(async () => { h = await freshHarness() })
  afterEach(async () => { await rm(h.cwd, { recursive: true, force: true }) })

  test('无引用 custom delete → exit 0 `deleted data`；--json {deleted,revision}；list 回 4 条', async () => {
    expect(await h.run(CREATE_DATA)).toBe(0)
    expect(await h.run(['tracks', 'delete', 'data'])).toBe(0)
    expect(h.out).toContain('deleted data')
    expect(await h.run([...CREATE_DATA])).toBe(0)
    expect(await h.run(['tracks', 'delete', 'data', '--json'])).toBe(0)
    expect(JSON.parse(h.out[0]!)).toMatchObject({ deleted: 'data' })
    expect(JSON.parse(h.out[0]!).revision).toBeTruthy()
    expect(await h.run(['tracks', 'list'])).toBe(0)
    expect(h.out.slice(1)).toHaveLength(4)
  })

  test('删内建 → exit 1', async () => {
    expect(await h.run(['tracks', 'delete', 'chat'])).toBe(1)
    expect(h.err.join('\n')).toContain('不可删除')
  })

  test('被活跃 change 引用 → 拒删 + 列名', async () => {
    expect(await h.run(CREATE_DATA)).toBe(0)
    expect(await h.run(['init', 'uses-data', '--track', 'data', '--preset', 'full'])).toBe(0)
    expect(await h.run(['tracks', 'delete', 'data'])).toBe(1)
    expect(h.err.join('\n')).toContain('被 1 个活跃 change 引用')
    expect(h.err.join('\n')).toContain('uses-data')
  })

  test('change 目录在但 .pipeline.yaml 缺失 → fail-closed 拒删（真 realDeps 严格枚举，codex R3 阻断 D）', async () => {
    // 复现 codex 定位的真漏洞：真实创建 openspec/changes/c1/ 目录但**不写 .pipeline.yaml**。
    // 旧实现 scanActiveChanges 走 deps.listChanges，会 access('.pipeline.yaml') 失败把 c1 剔出候选集
    // → unreadable=[] → 误删；新实现走 deps.listChangeDirs 严格枚举保留 c1 → store.read ENOENT 抛
    // → 进 unreadable → assertTrackDeletable fail-closed。全程 realDeps 真枚举（不 mock
    // listChanges/listChangeDirs），真复现真漏洞（旧 ghost 测试靠 mock 强塞、测不到本洞）。
    expect(await h.run(CREATE_DATA)).toBe(0)
    await mkdir(join(h.cwd, 'openspec', 'changes', 'c1'), { recursive: true })
    expect(existsSync(join(h.cwd, 'openspec', 'changes', 'c1', '.pipeline.yaml'))).toBe(false)
    expect(await h.run(['tracks', 'delete', 'data'])).toBe(1)
    expect(h.err.join('\n')).toContain('fail-closed')
    expect(h.err.join('\n')).toContain('c1')
    // 未落盘删除：tracks.yaml 仍有 data，list 仍列出
    expect(await readFile(join(h.cwd, '.pipeline', 'tracks.yaml'), 'utf8')).toContain('id: data')
    expect(await h.run(['tracks', 'list'])).toBe(0)
    expect(h.out.slice(1).map((l) => l.split(/\s+/)[0])).toContain('data')
  })

  test('archive 排除：已归档 change 不阻删', async () => {
    expect(await h.run(CREATE_DATA)).toBe(0)
    expect(await h.run(['init', 'archived-one', '--track', 'data', '--preset', 'full'])).toBe(0)
    // 归档 = 物理移入 openspec/changes/archive/（listChanges 只列直接子目录、排除 archive）
    await mkdir(join(h.cwd, 'openspec', 'changes', 'archive'), { recursive: true })
    await rename(join(h.cwd, 'openspec', 'changes', 'archived-one'), join(h.cwd, 'openspec', 'changes', 'archive', 'archived-one'))
    expect(await h.run(['tracks', 'delete', 'data'])).toBe(0)
    expect(h.out).toContain('deleted data')
  })
})

describe('pipeline tracks —— update 缩 allowed 引用完整性', () => {
  let h: Harness
  beforeEach(async () => { h = await freshHarness() })
  afterEach(async () => { await rm(h.cwd, { recursive: true, force: true }) })

  test('缩 allowed 排除在用 workflow → 拒改 + 列 change；改 label 不受阻', async () => {
    await writeWorkflow(h.cwd, 'draft-flow')
    // data allowed=[draft-flow, default]，change 绑 draft-flow
    expect(await h.run(['tracks', 'create', 'data', '--label', 'Data', '--workflow-default', 'draft-flow', '--workflow-allowed', 'draft-flow', 'default', '--policy', 'chat'])).toBe(0)
    expect(await h.run(['init', 'c1', '--track', 'data', '--workflow', 'draft-flow', '--preset', 'full'])).toBe(0)
    // 缩 allowed 到 [default]（去掉 draft-flow）→ c1 组合失效 → 拒
    expect(await h.run(['tracks', 'update', 'data', '--set-workflow-default', 'default', '--set-workflow-allowed', 'default'])).toBe(1)
    expect(h.err.join('\n')).toContain('c1')
    // 改 label 不动 workflow → 引用不受阻，放行
    expect(await h.run(['tracks', 'update', 'data', '--set-label', 'Data2'])).toBe(0)
  })

  test('缩 allowed 时有不可读 change（目录在但 .pipeline.yaml 缺失）→ fail-closed 拒改（真 realDeps，codex R3 阻断 D 对称覆盖）', async () => {
    await writeWorkflow(h.cwd, 'draft-flow')
    expect(await h.run(['tracks', 'create', 'data', '--label', 'Data', '--workflow-default', 'draft-flow', '--workflow-allowed', 'draft-flow', 'default', '--policy', 'chat'])).toBe(0)
    // 真实创建 c1 目录但不写 .pipeline.yaml → 严格枚举纳入候选 → store.read 抛 → unreadable → fail-closed。
    // assertUpdatePreservesReferences 先判 unreadable 再判 allowed，故缩 allowed 前即因不可读候选 fail-closed。
    await mkdir(join(h.cwd, 'openspec', 'changes', 'c1'), { recursive: true })
    expect(await h.run(['tracks', 'update', 'data', '--set-workflow-default', 'default', '--set-workflow-allowed', 'default'])).toBe(1)
    expect(h.err.join('\n')).toContain('fail-closed')
    expect(h.err.join('\n')).toContain('c1')
    // 未落盘改动：mutate 锁内 cb 抛 → 不写，allowed 仍含 draft-flow
    expect(await h.run(['tracks', 'show', 'data'])).toBe(0)
    expect(h.out.join('\n')).toContain('draft-flow')
  })
})

describe('pipeline tracks —— 防 memoization 回归（同进程 CRUD 后 init 见新 registry）', () => {
  test('同一 deps 实例：create data 后 init --track data 成功（无跨命令记忆化）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'lite-tracks-memo-'))
    try {
      const out: string[] = []
      const err: string[] = []
      const deps = realDeps(cwd, out, err)
      const run = async (args: string[]): Promise<number> => {
        out.length = 0
        err.length = 0
        try {
          await buildProgram(deps).parseAsync(args, { from: 'user' })
          return 0
        } catch (e) {
          if (e instanceof CliExit) return e.code
          throw e
        }
      }
      expect(await run(CREATE_DATA)).toBe(0)
      // 同一 deps 下 init：withRegistryLock 锁内 fresh-load 必须看到刚建的 data（memoized 则 requireTrack 失败）
      expect(await run(['init', 'dc', '--track', 'data', '--preset', 'full'])).toBe(0)
      expect(existsSync(join(cwd, 'openspec', 'changes', 'dc'))).toBe(true)
      const yaml = await readFile(join(cwd, 'openspec', 'changes', 'dc', '.pipeline.yaml'), 'utf8')
      expect(yaml).toContain('track: data')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
