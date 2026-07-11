/**
 * automationConfig.test —— AFK 执行参数存储 .pipeline/automation.json（T21）。
 * 真 fs（mkdtemp 临时目录，绝不碰真实项目/HOME），对齐 hooksConfig.test 基座。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_DEFAULTS, automationConfigPath, readAutomationSettings,
  validateAutomationSettingsBody, writeAutomationSettings,
} from './automationConfig.js'

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'afk-cfg-'))
}

async function seed(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'automation.json'), content, 'utf8')
}

describe('readAutomationSettings —— 缺省即 DEFAULT（fail-open）', () => {
  it('缺文件 → 全默认（max_parallel 4 / max_retries 1 / default_opt_in false / image 空=内置）', async () => {
    const root = await tempRoot()
    expect(readAutomationSettings(root)).toEqual(AUTOMATION_DEFAULTS)
    expect(AUTOMATION_DEFAULTS).toEqual({ max_parallel: 4, max_retries: 1, default_opt_in: false, image: '' })
  })

  it('损坏 JSON / 非对象顶层 → 全默认', async () => {
    for (const bad of ['not json {{{', '[1]', '"x"']) {
      const root = await tempRoot()
      await seed(root, bad)
      expect(readAutomationSettings(root)).toEqual(AUTOMATION_DEFAULTS)
    }
  })

  it('合法字段读出、非法字段逐个回落默认（值域同 automation 包读模块口径）', async () => {
    const root = await tempRoot()
    await seed(root, JSON.stringify({
      version: 1, max_parallel: 8, max_retries: 9, default_opt_in: true, image: 'ghcr.io/acme/sc:v2',
    }))
    expect(readAutomationSettings(root)).toEqual({
      max_parallel: 8, max_retries: 1, default_opt_in: true, image: 'ghcr.io/acme/sc:v2',
    })
  })

  it('手塞 enabled/level 不出现在读结果里（双源打架防线，同 automation 包读模块）', async () => {
    const root = await tempRoot()
    await seed(root, JSON.stringify({ version: 1, enabled: true, level: 'L3', max_parallel: 2 }))
    expect(readAutomationSettings(root)).toEqual({ ...AUTOMATION_DEFAULTS, max_parallel: 2 })
  })
})

describe('validateAutomationSettingsBody —— POST /api/automation 值域校验（fail-loud 400）', () => {
  const good = { max_parallel: 4, max_retries: 1, default_opt_in: false, image: '' }

  it('非对象 body → 拒绝', () => {
    for (const bad of [null, 'x', 42, ['a']]) {
      expect(validateAutomationSettingsBody(bad).ok).toBe(false)
    }
  })

  it('max_parallel 越界（0/9/小数/字符串/缺失）→ 拒绝', () => {
    for (const bad of [0, 9, 2.5, '4', undefined]) {
      const r = validateAutomationSettingsBody({ ...good, max_parallel: bad })
      expect(r.ok, `max_parallel=${JSON.stringify(bad)}`).toBe(false)
    }
  })

  it('max_retries 越界（-1/4/小数/布尔/缺失）→ 拒绝', () => {
    for (const bad of [-1, 4, 0.5, true, undefined]) {
      expect(validateAutomationSettingsBody({ ...good, max_retries: bad }).ok).toBe(false)
    }
  })

  it('default_opt_in 非布尔 → 拒绝', () => {
    for (const bad of ['true', 1, undefined]) {
      expect(validateAutomationSettingsBody({ ...good, default_opt_in: bad }).ok).toBe(false)
    }
  })

  it('image 非字符串 / 含空白 / 非法字符 / 超长 → 拒绝；空串放行（= 用内置镜像）', () => {
    for (const bad of [42, 'has space', 'a\nb', 'x'.repeat(201), '危险']) {
      expect(validateAutomationSettingsBody({ ...good, image: bad }).ok, `image=${JSON.stringify(bad)}`).toBe(false)
    }
    expect(validateAutomationSettingsBody({ ...good, image: '' }).ok).toBe(true)
  })

  it('合法全字段 → ok + 归一值（image trim）', () => {
    const r = validateAutomationSettingsBody({ max_parallel: 8, max_retries: 0, default_opt_in: true, image: ' sandcastle:local ' })
    expect(r).toEqual({ ok: true, value: { max_parallel: 8, max_retries: 0, default_opt_in: true, image: 'sandcastle:local' } })
  })
})

describe('writeAutomationSettings —— 真落盘（canonical JSON，automation 包读模块可回读）', () => {
  it('真写 .pipeline/automation.json；GET 侧回读一致；image 空串不落字段（缺省=内置镜像）', async () => {
    const root = await tempRoot()
    writeAutomationSettings(root, { max_parallel: 6, max_retries: 2, default_opt_in: true, image: '' })
    const text = await readFile(automationConfigPath(root), 'utf8')
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed).toEqual({ version: 1, max_parallel: 6, max_retries: 2, default_opt_in: true })
    expect(readAutomationSettings(root)).toEqual({ max_parallel: 6, max_retries: 2, default_opt_in: true, image: '' })
  })

  it('image 非空落字段；重复写幂等覆盖', async () => {
    const root = await tempRoot()
    writeAutomationSettings(root, { max_parallel: 4, max_retries: 1, default_opt_in: false, image: 'ghcr.io/a/b:v1' })
    writeAutomationSettings(root, { max_parallel: 4, max_retries: 1, default_opt_in: false, image: 'ghcr.io/a/b:v2' })
    expect(readAutomationSettings(root).image).toBe('ghcr.io/a/b:v2')
  })

  it('既有文件损坏 → 直接重建（不抛错、不落半成品）', async () => {
    const root = await tempRoot()
    await seed(root, '{{{broken')
    writeAutomationSettings(root, { max_parallel: 2, max_retries: 0, default_opt_in: false, image: '' })
    expect(() => JSON.parse(readFileSync(automationConfigPath(root), 'utf8'))).not.toThrow()
    expect(readAutomationSettings(root).max_parallel).toBe(2)
  })
})
