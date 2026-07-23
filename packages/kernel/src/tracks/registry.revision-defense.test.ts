/**
 * inspectExistingUnderLock 的 revision-失败归类（R2 阻断 2 的纵深防御层）。
 *
 * 可表示域统一后（validate 拒绝一切 serialize 写不出的值），「parse+validate 都过、
 * registryRevision 却抛」经公开 API 已构造不出。本文件用模块 mock 让 serialize 对带标记的
 * config 抛异常，从公开 API（writeTrackRegistry）驱动包装逻辑的验证：revision 计算失败必须
 * 归类为 RegistryCorruptFileError（该文件落进九格表损坏列，repairCorrupt 可修），而不是裸异常
 * 外泄。刻意不在主闸（validate）开洞造触发，也不为测试给生产码加注入缝。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProjectTrackConfig, TrackValidationContext } from './types.js'
// 本 import 也走 mock：非标记 config 直通真实实现，故可用它断言重建后的文件内容
import { serializeTrackRegistry } from './serialize.js'
import { RegistryCorruptFileError, trackRegistryPath, writeTrackRegistry } from './registry.js'

const MARKER = 'REVISION_BOOM'

vi.mock('./serialize.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./serialize.js')>()
  return {
    serializeTrackRegistry: (config: ProjectTrackConfig): string => {
      if (config.builtins?.chat?.label === MARKER) {
        throw new Error(`模拟 serialize 拒绝：validate 放行但写不出（标记 ${MARKER}）`)
      }
      return actual.serializeTrackRegistry(config)
    },
  }
})

const CTX: TrackValidationContext = {
  workflowExists: (id) => id === 'default',
  skillProfiles: new Set(['backend']),
}

const NEXT: ProjectTrackConfig = { version: 1, builtins: { chat: { label: '正常' } } }
/** parse 过、真实 validate 过（MARKER 是普通裸标量），仅 mock 后的 serialize 拒绝的现存文件。 */
const MARKER_FILE = `version: 1\nbuiltins:\n  chat:\n    label: ${MARKER}\n`

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), 'pl-tracks-revdef-'))
  await mkdir(path.join(repoRoot, '.pipeline'), { recursive: true })
  await writeFile(trackRegistryPath(repoRoot), MARKER_FILE, 'utf8')
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

describe('inspectExistingUnderLock —— revision 计算失败归类为损坏（纵深防御）', () => {
  test('无参数覆写 → RegistryCorruptFileError（detail 指明 revision 计算失败），文件保持原样', async () => {
    await expect(writeTrackRegistry(repoRoot, NEXT, CTX)).rejects.toBeInstanceOf(RegistryCorruptFileError)
    await expect(writeTrackRegistry(repoRoot, NEXT, CTX)).rejects.toThrow(/revision 计算失败/)
    expect(await readFile(trackRegistryPath(repoRoot), 'utf8')).toBe(MARKER_FILE)
  })

  test('expectedRevision → 同样按损坏拒绝（revision 无从比对）', async () => {
    await expect(writeTrackRegistry(repoRoot, NEXT, CTX, 'deadbeefdeadbeef')).rejects.toBeInstanceOf(
      RegistryCorruptFileError,
    )
    expect(await readFile(trackRegistryPath(repoRoot), 'utf8')).toBe(MARKER_FILE)
  })

  test('repairCorrupt:true → 用 next 重建成功（该文件降级进九格表损坏列，可修）', async () => {
    const reg = await writeTrackRegistry(repoRoot, NEXT, CTX, undefined, { repairCorrupt: true })
    expect(reg.byId.get('chat')?.label).toBe('正常')
    expect(await readFile(trackRegistryPath(repoRoot), 'utf8')).toBe(serializeTrackRegistry(NEXT))
  })
})
