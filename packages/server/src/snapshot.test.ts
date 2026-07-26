/** snapshot.test —— 真 fs：注册表读取 / 聚合 build / 指纹变化检测。 */
import { describe, expect, it } from 'vitest'
import { mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  builtinTrack,
  compileEffectiveWorkflowPlan,
  effectiveWorkflowPlanFromSnapshot,
  effectiveWorkflowPlanBinding,
  ensureDocumentLedger,
  loadEffectiveWorkflowPlan,
  TERMINAL_ACTIVITY_TTL_MS,
  workflowPlanSnapshot,
} from '@tenon/kernel'
import { buildSnapshot, computeFingerprint } from './snapshot.js'
import { readRegistry } from './registry.js'
import { initChange, makeProject, makeTempHome, newStore, sleep } from './test-support.js'

describe('readRegistry', () => {
  it('JSON 字符串数组 → 路径数组', async () => {
    const home = await makeTempHome()
    const p = join(home, 'pipeline-projects.json')
    await writeFile(p, JSON.stringify(['/a', '/b']), 'utf8')
    expect(readRegistry(p)).toEqual(['/a', '/b'])
  })
  it('缺文件 → []', async () => {
    expect(readRegistry(join(await makeTempHome(), 'missing.json'))).toEqual([])
  })
  it('损坏 JSON → []', async () => {
    const home = await makeTempHome()
    const p = join(home, 'pipeline-projects.json')
    await writeFile(p, '{ not json', 'utf8')
    expect(readRegistry(p)).toEqual([])
  })
})

describe('buildSnapshot —— 真读多项目 .pipeline.yaml', () => {
  it('canonical current 损坏必须在项目快照 fail-loud，不得静默把 change 隐藏成空项目', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'broken-current')
    await writeFile(join(dir, '.pipeline-run', 'current.json'), '{broken', 'utf8')

    const snap = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap.projects[0].ok).toBe(false)
    expect(snap.projects[0].error).toMatch(/broken-current.*current|current.*broken-current/i)
    expect(snap.change_count).toBe(0)
  })

  it('server 扫描自动重建缺失的 YAML projection，但 canonical 仍是读取真相', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'repair-on-scan')
    await unlink(join(dir, '.pipeline.yaml'))

    const snap = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap.projects[0].changes[0].name).toBe('repair-on-scan')
    expect(await store.inspectProjection(dir)).toMatchObject({ status: 'current' })
  })

  it('聚合两个注册项目、计数与相位真实', async () => {
    const store = newStore()
    const a = await makeProject()
    const b = await makeProject()
    await initChange(store, a, 'alpha')
    await initChange(store, b, 'beta', { track: 'pm' })
    const snap = await buildSnapshot({
      registry: () => [a, b], store, version: '1.2.3', clock: () => '2026-07-07T00:00:00Z',
    })
    expect(snap.version).toBe('1.2.3')
    expect(snap.project_count).toBe(2)
    expect(snap.change_count).toBe(2)
    const beta = snap.projects.find((p) => p.root === b)!.changes[0]
    expect(beta.name).toBe('beta')
    expect(beta.phase).toBe('open')
    expect(beta.track).toBe('pm')
  })

  it('automation_current_phase 经 fields 全量透传（T4 决策 G：进度详情「沙箱内阶段」数据源）', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'afk-run')
    // init 缺省空串（run 外无沙箱内阶段）
    const snap0 = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap0.projects[0].changes[0].fields.automation_current_phase).toBe('')
    // automation runner 运行期写入 → snapshot 原值透传（server 不加工、不改名）
    await store.set(dir, 'automation_current_phase', 'verify')
    const snap1 = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap1.projects[0].changes[0].fields.automation_current_phase).toBe('verify')
  })

  it('显式绑定的 host heartbeat 才投影为终端运行中；过期、错 change 或链接一律不显示', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'terminal-live')
    const now = Date.parse('2026-07-24T06:00:00.000Z')
    const sidecar = join(dir, '.pipeline-terminal-activity.json')
    await writeFile(sidecar, JSON.stringify({
      protocol: 'pipeline-terminal-activity-v1',
      change: 'terminal-live',
      session_id: '019f92c7-6e66-7290-9352-f9d915266f14',
      heartbeat_at: '2026-07-24T05:59:30.000Z',
      turn_id: 'turn-live',
    }), 'utf8')

    const live = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't', now: () => now })
    expect(live.projects[0].changes[0].terminalActivity).toMatchObject({
      sessionId: '019f92c7-6e66-7290-9352-f9d915266f14', turnId: 'turn-live',
    })
    const stale = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't', now: () => now + TERMINAL_ACTIVITY_TTL_MS,
    })
    expect(stale.projects[0].changes[0].terminalActivity).toBeUndefined()

    await unlink(sidecar)
    await symlink('outside.json', sidecar)
    const linked = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't', now: () => now })
    expect(linked.projects[0].changes[0].terminalActivity).toBeUndefined()
  })

  it('OpenSpec tasks.md 按 default 七阶段投影到 snapshot，而不是由原始会话提示词另造 Todo', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'todo-source')
    await store.set(dir, 'phase', 'build')
    await writeFile(join(dir, 'tasks.md'), `# Tasks

## Open
- [x] Confirm scope

## Build
- [ ] Implement the endpoint
`, 'utf8')

    const snapshot = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    const todo = snapshot.projects[0]?.changes[0]?.todo
    expect(todo?.hasTaskSource).toBe(true)
    expect(todo?.stages.map((stage) => stage.id)).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    expect(todo?.stages.find((stage) => stage.id === 'open')?.tasks).toEqual([
      { text: '[document] proposal', completed: false },
      { text: '[document] openspec-design', completed: false },
      { text: '[document] tasks', completed: false },
      { text: 'Confirm scope', completed: true },
    ])
    expect(todo?.stages.find((stage) => stage.id === 'build')?.tasks).toEqual([{ text: 'Implement the endpoint', completed: false }])
  })

  it('三步 document-v1 workflow 只投影真实 step，并把文档挂到声明的 owner step', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'compact-governed.yaml'), `name: compact-governed
document_contract:
  version: v1
  slots:
    - kind: proposal
      owner_step: shape
      producers: [writer]
  reads:
    - step: implement
      kinds: [proposal]
steps:
  - id: shape
    label: Shape
    gate: null
    skills:
      - id: writer
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: shaped
        to: implement
  - id: implement
    label: Implement
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: implemented
        to: verify
  - id: verify
    label: Verify
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    const changeDir = await store.init({
      repoRoot: root,
      name: 'compact-change',
      track: 'backend',
      reviewSeed: builtinTrack('backend').policyProfile.reviewSeed,
      preset: 'full',
      runId: 'compact-run',
      clock: () => '2026-07-07T00:00:00Z',
      initialWorkflow: {
        workflow: 'compact-governed',
        phase: 'shape',
        documentContract: true,
        documentProfile: 'document-v1',
      },
    })
    await ensureDocumentLedger(changeDir, '2026-07-07T00:00:00Z')

    const snapshot = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    const change = snapshot.projects[0]?.changes[0]
    expect(change?.todo?.stages.map((stage) => stage.id)).toEqual(['shape', 'implement', 'verify'])
    expect(change?.todo?.stages[0]?.tasks).toEqual([{ text: '[document] proposal', completed: false }])
    expect(change?.todo?.stages.some((stage) => stage.id === 'open')).toBe(false)
    expect(change?.documents).toMatchObject({
      governed: true,
      phase: 'shape',
      ledgerPresent: true,
      pass: false,
    })
  })

  it('已冻结 document-v1 workflow 后删除当前定义，snapshot 仍按初始化快照投影', async () => {
    const store = newStore()
    const root = await makeProject()
    const workflows = join(root, '.pipeline', 'workflows')
    await mkdir(workflows, { recursive: true })
    const target = join(workflows, 'bound.yaml')
    const governed = `name: bound
document_contract:
  version: v1
  slots:
    - kind: proposal
      owner_step: shape
      producers: [writer]
  reads: []
steps:
  - id: shape
    label: Shape
    gate: null
    skills:
      - id: writer
    inputs: []
    outputs: []
    guards: []
    transitions: []
`
    await writeFile(target, governed, 'utf8')
    const plan = loadEffectiveWorkflowPlan(root, 'bound')
    const changeDir = await store.init({
      repoRoot: root,
      name: 'bound-change',
      track: 'backend',
      reviewSeed: builtinTrack('backend').policyProfile.reviewSeed,
      preset: 'full',
      runId: 'bound-run',
      clock: () => '2026-07-07T00:00:00Z',
      initialWorkflow: {
        workflow: 'bound',
        phase: 'shape',
        ...effectiveWorkflowPlanBinding(plan),
        workflowPlanSnapshot: workflowPlanSnapshot(plan),
      },
    })
    expect(await readdir(changeDir)).toContain('.pipeline-workflow-plan.json')
    expect((await store.read(changeDir)).runMetadata?.workflowPlanSnapshot).toBeDefined()
    await writeFile(target, governed.replace(/document_contract:[\s\S]*?(?=steps:)/, ''), 'utf8')

    const snapshot = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snapshot.projects[0]?.ok, JSON.stringify(snapshot.projects[0])).toBe(true)
    expect(snapshot.projects[0]?.changes[0]?.todo?.stages.map((stage) => stage.id)).toEqual(['shape'])
    expect(snapshot.projects[0]?.changes[0]?.documents?.governed).toBe(true)
    expect(snapshot.change_count).toBe(1)
  })

  it('Tenon server 继续投影身份迁移前冻结的 default v1 workflow snapshot', async () => {
    const store = newStore()
    const root = await makeProject()
    const legacyWorkflow = compileEffectiveWorkflowPlan('default').workflow
    const legacyChangeDir = await store.init({
      repoRoot: root,
      name: 'legacy-v1-live',
      track: 'frontend',
      reviewSeed: builtinTrack('frontend').policyProfile.reviewSeed,
      preset: 'full',
      runId: 'legacy-v1-run',
      clock: () => '2026-07-26T00:00:00Z',
      initialWorkflow: {
        workflow: 'default',
        phase: 'verify',
        documentProfile: 'legacy-full',
        documentGovernanceFingerprint:
          '9238b11b7f0c0e7102eceddb5cb688c030e1a919fb5aef93ed5ba33ab7c2ec68',
        workflowPlanFingerprint:
          'c9a829b12b12138522532a9127efb8b93a551b1f28922a53dc174ad13e35b7dd',
        workflowPlanSnapshot: {
          version: 1,
          workflowId: 'default',
          executionModel: 'phase-manifest',
          workflow: legacyWorkflow,
          workflowFingerprint:
            'c9a829b12b12138522532a9127efb8b93a551b1f28922a53dc174ad13e35b7dd',
        },
      },
    })
    const legacyState = await store.read(legacyChangeDir)
    expect(legacyState.runMetadata?.workflowPlanSnapshot).toBeDefined()
    expect(effectiveWorkflowPlanFromSnapshot(legacyState.runMetadata!.workflowPlanSnapshot!)
      .workflowFingerprint).toBe(
      'c9a829b12b12138522532a9127efb8b93a551b1f28922a53dc174ad13e35b7dd',
    )

    const snapshot = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1.0.0',
      clock: () => '2026-07-26T00:00:00Z',
    })

    expect(snapshot.projects[0]?.ok, snapshot.projects[0]?.error).toBe(true)
    expect(snapshot.projects[0]?.changes[0]).toMatchObject({
      name: 'legacy-v1-live',
      phase: 'verify',
    })
  })

  it('simple workflow 投影自己的 change→verify→done/escalated 骨架，不伪造七阶段或 OpenSpec 文档', async () => {
    const store = newStore()
    const root = await makeProject()
    await initChange(store, root, 'tiny-fix', { track: 'simple', preset: 'tweak' })

    const snapshot = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    const change = snapshot.projects[0]?.changes[0]
    expect(change?.phase).toBe('change')
    expect(change?.fields.workflow).toBe('simple')
    expect(change?.todo).toEqual({
      hasTaskSource: false,
      stages: [
        { id: 'change', label: 'Change', status: 'current', tasks: [] },
        { id: 'verify', label: 'Verify', status: 'pending', tasks: [] },
        { id: 'done', label: 'Done', status: 'pending', tasks: [] },
        { id: 'escalated', label: 'Escalated', status: 'pending', tasks: [] },
      ],
    })
    expect(change?.documents).toEqual({ governed: false, blockers: [], items: [] })

    const dir = join(root, 'openspec', 'changes', 'tiny-fix')
    await store.set(dir, 'phase', 'escalated')
    const escalated = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(escalated.projects[0]?.changes[0]?.todo?.stages.map((stage) => [stage.id, stage.status])).toEqual([
      ['change', 'done'],
      ['verify', 'pending'],
      ['done', 'pending'],
      ['escalated', 'current'],
    ])
  })

  it('不存在的注册路径 → ok:false 不炸', async () => {
    const snap = await buildSnapshot({
      registry: () => ['/definitely/not/here'], store: newStore(), version: '0', clock: () => 'x',
    })
    expect(snap.project_count).toBe(1)
    expect(snap.projects[0].ok).toBe(false)
    expect(snap.change_count).toBe(0)
  })
})

describe('computeFingerprint —— 变更检测', () => {
  it('dangling canonical current 仍进入 fingerprint，不能因 stat 跟随失败而消失', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'dangling-current')
    const current = join(dir, '.pipeline-run', 'current.json')
    await unlink(current)
    await symlink('missing.json', current)

    expect(await computeFingerprint([root])).toContain('.pipeline-run/current.json')
  })

  it('YAML projection 缺失时仍以 canonical current 追踪 change 与 revision 变化', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'canonical-only')
    await unlink(join(dir, '.pipeline.yaml'))

    const fp0 = await computeFingerprint([root])
    expect(fp0).toContain('.pipeline-run/current.json')
    await sleep(5)
    await store.set(dir, 'phase', 'explore')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })

  it('写盘后指纹改变（SSE 推送的触发源）', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'c1')
    const fp0 = await computeFingerprint([root])
    await sleep(5)
    await store.set(dir, 'phase', 'explore')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })

  it('tasks.md 变更也改变指纹，SSE 会推送新的 Todo 投影', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'todo-fingerprint')
    const tasks = join(dir, 'tasks.md')
    await writeFile(tasks, '- [ ] First task\n', 'utf8')
    const fp0 = await computeFingerprint([root])
    await sleep(5)
    await writeFile(tasks, '- [x] First task\n', 'utf8')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })

  it('terminal activity 到 TTL 会令指纹切换，SSE 不会把停止的普通会话永久显示为运行中', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'terminal-expiry')
    const heartbeat = Date.parse('2026-07-24T06:00:00.000Z')
    await writeFile(join(dir, '.pipeline-terminal-activity.json'), JSON.stringify({
      protocol: 'pipeline-terminal-activity-v1',
      change: 'terminal-expiry',
      session_id: 'session-expiry',
      heartbeat_at: '2026-07-24T06:00:00.000Z',
    }), 'utf8')
    const fresh = await computeFingerprint([root], heartbeat)
    const expired = await computeFingerprint([root], heartbeat + TERMINAL_ACTIVITY_TTL_MS)
    expect(fresh).not.toBe(expired)
  })
})
