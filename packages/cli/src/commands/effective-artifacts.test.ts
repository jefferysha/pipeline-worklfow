/**
 * effectiveArtifactFields 单测（G2 P6）——default 轨 declaration 判定 + fail-loud。
 * custom 轨（loadWorkflow 真 fs）成功/损坏路径在 artifact.integration.test.ts 端到端覆盖。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps, mockState } from '../test-support.js'
import { effectiveArtifactFields } from './effective-artifacts.js'

describe('effectiveArtifactFields —— default 轨当前有效 artifact 字段集', () => {
  test('explore/frontend → {design_doc}', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'explore', track: 'frontend', workflow: 'default' }))]).toEqual(['design_doc'])
  })

  test('spec/frontend → {plan}', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'spec', track: 'frontend' }))]).toEqual(['plan'])
  })

  test('spec/pm → {}（PM 保持 legacy plan artifact 豁免；文档 plan 另走 OpenSpec ledger）', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'spec', track: 'pm' }))]).toEqual([])
  })

  test('verify/frontend → {verification_report}', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'verify', track: 'frontend' }))]).toEqual(['verification_report'])
  })

  test('open/frontend（无 artifact 声明的 step）→ {}', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'open', track: 'frontend' }))]).toEqual([])
  })

  test('build/frontend（design_doc 曾在 explore 声明，但 build 步不因字段名自动算 artifact）→ {}', () => {
    const deps = makeDeps()
    expect([...effectiveArtifactFields(deps, mockState({ phase: 'build', track: 'frontend' }))]).toEqual([])
  })
})

describe('effectiveArtifactFields —— custom workflow 文件缺失 vs 损坏', () => {
  test('workflow 文件不存在（仅 registry 名、无定义文件）→ 空集（无声明可 cutover，非降级放行）', () => {
    const deps = makeDeps()
    // loadWorkflow 返 null → 空集：该 workflow 无 artifact 声明可内省。真正 corrupted 的文件（存在但
    // parse/compile 失败）仍 fail-loud（throw），由 artifact.integration.test.ts 端到端覆盖。
    expect([...effectiveArtifactFields(deps, mockState({ phase: 's1', track: 'backend', workflow: 'ghost' }))]).toEqual([])
  })
})
