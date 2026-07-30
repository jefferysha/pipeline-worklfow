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
  it('明确未来 canonical 版本投影为有界 issue，并与可读 Change 共存且不泄露路径', async () => {
    const store = newStore()
    const root = await makeProject()
    const futureDir = await initChange(store, root, 'future-state')
    await initChange(store, root, 'readable-state')
    const currentPath = join(futureDir, '.pipeline-run', 'current.json')
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    await writeFile(currentPath, JSON.stringify({
      ...current,
      schemaVersion: 2,
      futureOnly: { sourcePath: currentPath },
    }), 'utf8')

    const snapshot = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    const project = snapshot.projects[0] as typeof snapshot.projects[number] & {
      compatibilityIssues?: Array<{
        kind: string
        change: string
        foundVersion: number
        supportedVersion: number
        action: string
      }>
    }

    expect(project.ok).toBe(false)
    expect(project.changes.map((change) => change.name)).toEqual(['readable-state'])
    expect(snapshot.change_count).toBe(1)
    expect(project.compatibilityIssues).toEqual([{
      kind: 'unsupported-canonical-version',
      change: 'future-state',
      foundVersion: 2,
      supportedVersion: 1,
      action: 'upgrade-runtime',
    }])
    expect(project.error).toBeUndefined()
    expect(JSON.stringify(project.compatibilityIssues)).not.toContain(root)
    expect(JSON.stringify(project.compatibilityIssues)).not.toContain('futureOnly')
  })

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

  it('未来版本与普通损坏并存时同时保留有界兼容信息和 corruption error', async () => {
    const store = newStore()
    const root = await makeProject()
    const futureDir = await initChange(store, root, 'future-state')
    const brokenDir = await initChange(store, root, 'broken-current')
    await initChange(store, root, 'readable-state')
    const futureCurrentPath = join(futureDir, '.pipeline-run', 'current.json')
    const futureCurrent = JSON.parse(await readFile(futureCurrentPath, 'utf8')) as Record<string, unknown>
    await writeFile(futureCurrentPath, JSON.stringify({ ...futureCurrent, schemaVersion: 2 }), 'utf8')
    await writeFile(join(brokenDir, '.pipeline-run', 'current.json'), '{broken', 'utf8')

    const snapshot = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    const project = snapshot.projects[0]
    expect(project.ok).toBe(false)
    expect(project.changes.map((change) => change.name)).toEqual(['readable-state'])
    expect(project.compatibilityIssues?.map((issue) => issue.change)).toEqual(['future-state'])
    expect(project.error).toMatch(/broken-current/)
  })

  it('兼容问题数组最多返回 100 项，超限时 fail-loud 且不泄露额外路径', async () => {
    const store = newStore()
    const root = await makeProject()
    for (let index = 0; index < 101; index += 1) {
      const dir = await initChange(store, root, `future-${String(index).padStart(3, '0')}`)
      const currentPath = join(dir, '.pipeline-run', 'current.json')
      const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
      await writeFile(currentPath, JSON.stringify({ ...current, schemaVersion: 2 }), 'utf8')
    }

    const snapshot = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    const project = snapshot.projects[0]
    expect(project.compatibilityIssues).toHaveLength(100)
    expect(project.error).toMatch(/compatibility issue limit.*100/i)
    expect(project.error).not.toContain(root)
  }, 15_000)

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
    expect(beta.workflowRules).toMatchObject({
      steps: ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'],
      gateByStep: { explore: 'review', spec: 'review', verify: 'review' },
    })
    expect(Object.keys(beta.workflowExecution.readinessByTransition)).toEqual(['open'])
    expect(beta.workflowExecution.readinessByTransition.open).toEqual({
      'open-complete': { ready: true, blockers: [] },
    })
    expect((snap.projects.find((p) => p.root === b) as unknown as {
      workflowRules: Record<string, { nonemptyOutputByStep: Record<string, boolean> }>
    }).workflowRules.default.nonemptyOutputByStep).toHaveProperty('open')
  })

  it('从 canonical receipt 投影未请求、待确认和已批准的 exact-event handshake', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'review-handshake')
    await store.set(dir, 'phase', 'verify')

    const idle = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(idle.projects[0]?.changes[0]?.reviewHandshake).toEqual({
      status: 'not-requested',
    })

    await store.setMany(dir, {
      review_gate_phase: 'verify',
      review_gate_status: 'pending',
      review_gate_event: 'verify-pass',
      review_requested_at: '2026-07-30T02:00:00Z',
      review_acknowledged_at: '',
    })
    const pending = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(pending.projects[0]?.changes[0]?.reviewHandshake).toEqual({
      status: 'pending',
      event: 'verify-pass',
      requestedAt: '2026-07-30T02:00:00Z',
    })

    await store.setMany(dir, {
      review_gate_status: 'approved',
      review_acknowledged_at: '2026-07-30T02:01:00Z',
    })
    const approved = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(approved.projects[0]?.changes[0]?.reviewHandshake).toEqual({
      status: 'approved',
      event: 'verify-pass',
      requestedAt: '2026-07-30T02:00:00Z',
      acknowledgedAt: '2026-07-30T02:01:00Z',
    })
  })

  it('非法或漂移的 canonical receipt 必须 fail-loud，不能美化成未请求', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'invalid-review-handshake')
    await store.setMany(dir, {
      phase: 'verify',
      review_gate_phase: 'verify',
      review_gate_status: 'pending',
      review_gate_event: 'spec-complete',
      review_requested_at: '2026-07-30T02:00:00Z',
      review_acknowledged_at: '',
    })

    const snapshot = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(snapshot.projects[0]?.ok).toBe(false)
    expect(snapshot.projects[0]?.error).toMatch(/invalid-review-handshake.*review handshake/i)
    expect(snapshot.change_count).toBe(0)
  })

  it('default Build readiness 投影 pre-Verify 全量收敛门，pending 不得显示可冻结', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'pre-verify-readiness')
    await store.setMany(dir, {
      phase: 'build',
      build_mode: 'direct',
      isolation: 'in-place',
      direct_override: 'true',
    })

    const blocked = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(
      blocked.projects[0]?.changes[0]?.workflowExecution
        .readinessByTransition.build?.['build-complete'],
    ).toEqual({
      ready: false,
      blockers: [{
        kind: 'guard-failed',
        guardType: 'field-equals',
        field: 'pre_verify_review_result',
        actual: 'pending',
        expected: ['pass'],
      }],
    })

    await store.set(dir, 'pre_verify_review_result', 'pass')
    const ready = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => 't',
    })
    expect(
      ready.projects[0]?.changes[0]?.workflowExecution
        .readinessByTransition.build?.['build-complete'],
    ).toEqual({ ready: true, blockers: [] })
  })

  it('非当前 phase 不求值 workspace fingerprint，当前求值异常只投影 blocker 而不让项目离线', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'fingerprint-read-model')
    await store.set(dir, 'build_sha', `workspace:sha256:${'a'.repeat(64)}`)
    let calls = 0
    const fingerprint = async () => {
      calls += 1
      throw new Error('workspace changed during traversal')
    }

    const open = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
      workspaceFingerprint: fingerprint,
    })
    expect(calls).toBe(0)
    expect(open.projects[0]?.ok).toBe(true)

    await store.set(dir, 'phase', 'verify')
    const verify = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
      workspaceFingerprint: fingerprint,
    })
    expect(calls).toBe(1)
    expect(verify.projects[0]?.ok).toBe(true)
    expect(
      verify.projects[0]?.changes[0]?.workflowExecution.readinessByTransition.verify?.['verify-pass'],
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([{
        kind: 'evaluation-error',
        guardType: 'build-head-unchanged',
        capability: 'workspaceFingerprint',
      }]),
    })
  })

  it('条件 nonempty guard 只为适用 Track 投影必需输出', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'conditional-output.yaml'), `name: conditional-output
steps:
  - id: shape
    label: Shape
    gate: review
    skills: []
    inputs: []
    outputs:
      - field: plan
        type: file_path
      - field: scope
        type: string
    guards:
      - type: nonempty-output
        when:
          track_in: [backend]
    transitions:
      - event: continue
        to: shape
`, 'utf8')
    await initChange(store, root, 'conditional-backend', {
      track: 'backend',
      initialWorkflow: { workflow: 'conditional-output', phase: 'shape' },
    })
    await initChange(store, root, 'conditional-pm', {
      track: 'pm',
      initialWorkflow: { workflow: 'conditional-output', phase: 'shape' },
    })

    const snapshot = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
    })
    const byName = new Map(snapshot.projects[0]?.changes.map((change) => [change.name, change]))

    expect(byName.get('conditional-backend')?.workflowExecution.readinessByTransition.shape)
      .toEqual({
        continue: {
          ready: false,
          blockers: [
            { kind: 'guard-failed', guardType: 'field-nonempty', field: 'plan', actual: 'null' },
            { kind: 'guard-failed', guardType: 'output-present', field: 'scope', actual: 'null' },
          ],
        },
      })
    expect(byName.get('conditional-pm')?.workflowExecution.readinessByTransition.shape)
      .toEqual({ continue: { ready: true, blockers: [] } })
    expect(byName.get('conditional-backend')?.workflowRules)
      .toEqual(byName.get('conditional-pm')?.workflowRules)
  })

  it('workflow label 投影覆盖每个 step；未声明展示名时用 step id 保持边界契约完整', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'partial-labels.yaml'), `name: partial-labels
steps:
  - id: draft
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: finish
        to: done
  - id: done
    label: 完成
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    await initChange(store, root, 'partial-labels', {
      initialWorkflow: { workflow: 'partial-labels', phase: 'draft' },
    })

    const snapshot = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
    })

    expect(snapshot.projects[0]?.changes[0]?.workflowRules.labelByStep).toEqual({
      draft: 'draft',
      done: '完成',
    })
  })

  it('逐 event 投影 step + edge guard，多个出口不得合并成 step 级并集', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'edge-evidence.yaml'), `name: edge-evidence
steps:
  - id: review
    label: Review
    gate: review
    skills: []
    inputs: []
    outputs:
      - field: plan
        type: file_path
      - field: scope
        type: string
    guards:
      - type: nonempty-output
    transitions:
      - event: accept
        to: done
        guards:
          - type: field-nonempty
            field: verification_report
      - event: revise
        to: done
  - id: done
    label: Done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    await initChange(store, root, 'edge-evidence', {
      track: 'backend',
      initialWorkflow: { workflow: 'edge-evidence', phase: 'review' },
    })

    const snapshot = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
    })

    expect(snapshot.projects[0]?.changes[0]?.workflowExecution.readinessByTransition).toEqual({
      review: {
        accept: {
          ready: false,
          blockers: [
            { kind: 'guard-failed', guardType: 'field-nonempty', field: 'plan', actual: 'null' },
            { kind: 'guard-failed', guardType: 'output-present', field: 'scope', actual: 'null' },
            { kind: 'guard-failed', guardType: 'field-nonempty', field: 'verification_report', actual: 'null' },
          ],
        },
        revise: {
          ready: false,
          blockers: [
            { kind: 'guard-failed', guardType: 'field-nonempty', field: 'plan', actual: 'null' },
            { kind: 'guard-failed', guardType: 'output-present', field: 'scope', actual: 'null' },
          ],
        },
      },
    })
  })

  it('逐 event readiness 复用 canonical guard 语义，不得把非空字段误判为谓词通过', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'semantic-readiness.yaml'), `name: semantic-readiness
steps:
  - id: review
    label: Review
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards:
      - type: tasks-at-least
        n: 2
    transitions:
      - event: accept
        to: done
        guards:
          - type: field-equals
            field: branch_status
            value: handled
          - type: field-in
            field: verify_result
            values: [pass]
          - type: file-exists
            field: verification_report
  - id: done
    label: Done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    const dir = await initChange(store, root, 'semantic-readiness', {
      track: 'backend',
      initialWorkflow: { workflow: 'semantic-readiness', phase: 'review' },
    })
    await store.setMany(dir, {
      branch_status: 'pending',
      verify_result: 'fail',
      verification_report: 'docs/missing.md',
    })
    await writeFile(join(dir, 'tasks.md'), '- [x] only-one\n', 'utf8')

    const snapshot = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
    })
    expect(snapshot.projects[0]?.error).toBeUndefined()
    const execution = snapshot.projects[0]?.changes[0]?.workflowExecution as unknown as {
      readinessByTransition: Record<string, Record<string, {
        ready: boolean
        blockers: Array<{ guardType: string; field?: string; actual?: string; expected?: readonly string[] }>
      }>>
    }

    expect(execution.readinessByTransition.review.accept).toEqual({
      ready: false,
      blockers: [
        { kind: 'guard-failed', guardType: 'tasks-at-least', actual: '1', expected: ['2'] },
        {
          kind: 'guard-failed',
          guardType: 'field-equals',
          field: 'branch_status',
          actual: 'pending',
          expected: ['handled'],
        },
        {
          kind: 'guard-failed',
          guardType: 'field-in',
          field: 'verify_result',
          actual: 'fail',
          expected: ['pass'],
        },
        {
          kind: 'guard-failed',
          guardType: 'file-exists',
          field: 'verification_report',
          actual: 'docs/missing.md',
        },
      ],
    })
  })

  it('无法取得 Git capability 时 readiness 失败关闭，取得后仍按 canonical SHA 谓词求值', async () => {
    const store = newStore()
    const root = await makeProject()
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'sha-readiness.yaml'), `name: sha-readiness
steps:
  - id: verify
    label: Verify
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: pass
        to: done
        guards:
          - type: build-head-unchanged
            field: build_sha
  - id: done
    label: Done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    const dir = await initChange(store, root, 'sha-readiness', {
      track: 'backend',
      initialWorkflow: { workflow: 'sha-readiness', phase: 'verify' },
    })
    await store.set(dir, 'build_sha', 'abc123')

    const unavailable = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
    })
    expect(
      unavailable.projects[0]?.changes[0]?.workflowExecution.readinessByTransition.verify?.pass,
    ).toEqual({
      ready: false,
      blockers: [{
        kind: 'capability-unavailable',
        guardType: 'build-head-unchanged',
        capability: 'gitHeadSha',
      }],
    })

    const mismatch = await buildSnapshot({
      registry: () => [root],
      store,
      version: '1',
      clock: () => 't',
      gitHeadSha: async () => 'def456',
    })
    expect(
      mismatch.projects[0]?.changes[0]?.workflowExecution.readinessByTransition.verify?.pass,
    ).toEqual({
      ready: false,
      blockers: [{
        kind: 'guard-failed',
        guardType: 'build-head-unchanged',
        field: 'build_sha',
        actual: 'def456',
        expected: ['abc123'],
      }],
    })
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
    const currentWorkflow = compileEffectiveWorkflowPlan('default').workflow
    const legacyWorkflow = {
      ...currentWorkflow,
      steps: currentWorkflow.steps.map((step) => ({
        ...step,
        guards: step.id === 'build'
          ? step.guards.filter((guard) =>
              !(guard.type === 'field-equals' && guard.field === 'pre_verify_review_result'))
          : step.guards,
        transitions: step.transitions.map((transition) => ({
          ...transition,
          actions: transition.actions.filter((action) =>
            action.type !== 'reset-pre-verify-review'
              && !(step.id === 'verify'
                && transition.event === 'verify-fail'
                && action.type === 'mark-verification-failed')),
        })),
      })),
    }
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
