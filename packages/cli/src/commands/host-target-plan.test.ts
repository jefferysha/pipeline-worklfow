import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import {
  createHostTargetCatalog,
  createHostTargetPlan,
  cmdHostTargetPlan,
} from './host-target-plan.js'
import {
  TENON_HOSTS,
  nativeInstallPlan,
  nativeUpdatePlan,
} from './plugin-host.js'

describe('host-target-plan —— 稳定、白名单且零副作用的宿主计划', () => {
  test('catalog 严格按 TENON_HOSTS 顺序公开 native/adapter 能力', () => {
    const catalog = createHostTargetCatalog()

    expect(catalog.schema_version).toBe('host-target-plan/v1')
    expect(catalog.targets.map(({ id }) => id)).toEqual(TENON_HOSTS)
    expect(catalog.targets[0]).toEqual({
      id: 'codex',
      kind: 'native',
      cli_flag: '--codex',
      target_scope: 'user',
      supported_operations: ['setup', 'update'],
      capabilities: [
        'native-marketplace',
        'managed-runtime',
        'bundled-skills',
        'automatic-update',
      ],
    })
    expect(catalog.targets[2]).toEqual({
      id: 'cursor',
      kind: 'adapter',
      cli_flag: '--cursor',
      target_scope: 'project',
      supported_operations: ['setup', 'update'],
      capabilities: ['project-adapter', 'managed-runtime', 'bundled-skills'],
    })
  })

  test('native setup/update 逐项复用现有 host command plan，并按真实外层流程追加只读产品步骤', () => {
    const setup = createHostTargetPlan('codex', 'setup')
    const update = createHostTargetPlan('claude', 'update')

    expect(setup.side_effects).toBe('none')
    expect(setup.command).toEqual({
      executable: 'tenon',
      args: ['setup', '--codex'],
      display: 'tenon setup --codex',
    })
    expect(setup.steps.slice(0, nativeInstallPlan('codex').length).map(({ command }) => command)).toEqual(
      nativeInstallPlan('codex').map(({ cmd, args }) => ({
        executable: cmd,
        args: [...args],
        display: [cmd, ...args].join(' '),
      })),
    )
    expect(update.steps.slice(0, nativeUpdatePlan('claude').length).map(({ command }) => command)).toEqual(
      nativeUpdatePlan('claude').map(({ cmd, args }) => ({
        executable: cmd,
        args: [...args],
        display: [cmd, ...args].join(' '),
      })),
    )
    expect(setup.steps.slice(-3)).toEqual([
      { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
      { id: 'bundled-skills', label: 'host-plan.step.bundled-skills', command: null },
      { id: 'runtime-readiness', label: 'host-plan.step.runtime-readiness', command: null },
    ])
    expect(update.steps.slice(nativeUpdatePlan('claude').length)).toEqual([
      { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
    ])
  })

  test('adapter setup/update 分别对齐真实外层流程并固定使用 <project> 占位', () => {
    const setup = createHostTargetPlan('cursor', 'setup')
    const update = createHostTargetPlan('cursor', 'update')

    expect(update).toMatchObject({
      schema_version: 'host-target-plan/v1',
      side_effects: 'none',
      operation: 'update',
      command: {
        executable: 'tenon',
        args: ['update', '--cursor', '--target', '<project>'],
        display: 'tenon update --cursor --target <project>',
      },
      notices: [
        'host-plan.notice.read-only-generation',
        'host-plan.notice.manual-command-has-effects',
        'host-plan.notice.project-placeholder',
      ],
    })
    expect(setup.steps.map(({ id }) => id)).toEqual([
      'package-assets',
      'managed-runtime',
      'adapter-deploy',
      'bundled-skills',
      'runtime-readiness',
    ])
    expect(update.steps).toEqual([
      { id: 'package-assets', label: 'host-plan.step.package-assets', command: null },
      { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
      {
        id: 'adapter-deploy',
        label: 'host-plan.step.adapter-deploy',
        command: {
          executable: 'tenon',
          args: ['update', '--cursor', '--target', '<project>'],
          display: 'tenon update --cursor --target <project>',
        },
      },
    ])
  })

  test('命令只接受 TENON_HOSTS 与 setup|update，非法输入不产生任何状态写入', () => {
    const deps = makeDeps()

    expect(cmdHostTargetPlan(deps, {})).toBe(1)
    expect(cmdHostTargetPlan(deps, { host: 'custom', operation: 'setup', json: true })).toBe(1)
    expect(cmdHostTargetPlan(deps, { host: 'codex', operation: 'upgrade', json: true })).toBe(1)
    expect(cmdHostTargetPlan(deps, { host: 'codex', json: true })).toBe(1)
    expect(cmdHostTargetPlan(deps, { operation: 'setup', json: true })).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.store.write.calls).toHaveLength(0)
    expect(deps.store.set.calls).toHaveLength(0)
    expect(deps.store.setMany.calls).toHaveLength(0)
    expect(deps.store.cas.calls).toHaveLength(0)
  })

  test('每个白名单宿主的 setup/update 都生成确定性、非空且 zero-side-effect 的计划', () => {
    for (const host of TENON_HOSTS) {
      for (const operation of ['setup', 'update'] as const) {
        const first = createHostTargetPlan(host, operation)
        const second = createHostTargetPlan(host, operation)

        expect(second).toEqual(first)
        expect(first.host.id).toBe(host)
        expect(first.operation).toBe(operation)
        expect(first.side_effects).toBe('none')
        expect(first.steps.length).toBeGreaterThan(0)
        expect(first.command.args[0]).toBe(operation)
        expect(first.command.args[1]).toBe(`--${host}`)
      }
    }
  })

  test('catalog 与单计划命令只向 stdout 写一个 JSON DTO', () => {
    const catalogDeps = makeDeps()
    const planDeps = makeDeps()

    expect(cmdHostTargetPlan(catalogDeps, { json: true })).toBe(0)
    expect(JSON.parse(catalogDeps.outLines[0]!)).toEqual(createHostTargetCatalog())
    expect(catalogDeps.outLines).toHaveLength(1)
    expect(catalogDeps.errLines).toEqual([])

    expect(cmdHostTargetPlan(planDeps, {
      host: 'amp',
      operation: 'setup',
      json: true,
    })).toBe(0)
    expect(JSON.parse(planDeps.outLines[0]!)).toEqual(createHostTargetPlan('amp', 'setup'))
    expect(planDeps.outLines).toHaveLength(1)
    expect(planDeps.errLines).toEqual([])
  })
})
