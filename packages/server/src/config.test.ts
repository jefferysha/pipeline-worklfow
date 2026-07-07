/**
 * config.test —— M3 config 写端点收编（GOAL A3 「config 写端点为可选增量」）：
 * 真 fs 读写 + 真 kernel loadManifest 往返解析校验（GOAL C9 风格：零 mock 磁盘/解析器，
 * 真拷贝仓库 templates/manifest.yaml 到临时文件，真改真读）。HTTP 层的鉴权/路由测试见 server.test.ts。
 */
import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadManifest } from '@pipeline-lite/kernel'
import type { ExtendedManifestData } from '@pipeline-lite/kernel'
import {
  ConfigError,
  flattenMandatorySkills,
  readMandatorySkills,
  validateMandatorySkillsBody,
  writeMandatorySkills,
} from './config.js'
import { makeTempManifest, repoManifestPath } from './test-support.js'

describe('flattenMandatorySkills（纯派生：嵌套 SkillTable → 扁平 phase.track 映射）', () => {
  it('只暴露实际声明过的 phase.track 键（含 _all 兜底键，供前端三级回退只读展示）', () => {
    const fake = {
      mandatorySkills: {
        open: { _all: ['opsx:propose|openspec-propose'] },
        explore: {},
        spec: {},
        build: { backend: ['a', 'b'] },
        verify: {},
        ship: {},
        archive: {},
      },
    } as unknown as Pick<ExtendedManifestData, 'mandatorySkills'>
    const flat = flattenMandatorySkills(fake)
    expect(flat['open._all']).toEqual(['opsx:propose|openspec-propose'])
    expect(flat['build.backend']).toEqual(['a', 'b'])
    expect(flat['explore.pm']).toBeUndefined()
    expect(flat['archive.pm']).toBeUndefined()
  })
})

describe('readMandatorySkills（真读仓库 templates/manifest.yaml，零 mock）', () => {
  it('build.backend 含 TDD skill；open._all 含 propose skill（与前端 data.ts 镜像一致）', () => {
    const flat = readMandatorySkills(repoManifestPath())
    expect(flat['build.backend']).toContain('superpowers:test-driven-development')
    expect(flat['open._all']).toContain('opsx:propose|openspec-propose')
    // 目前未声明 open.pm/open.frontend/open.backend（只有 _all 兜底）——写入面测试的前提假设
    expect(flat['open.pm']).toBeUndefined()
  })
})

describe('validateMandatorySkillsBody（写端点请求体校验，fail-loud）', () => {
  it('合法 body 通过', () => {
    const r = validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: ['a', 'b:c', 'd|e', 'x.y/z'] })
    expect(r.ok).toBe(true)
  })
  it('非对象 body → 拒绝', () => {
    expect(validateMandatorySkillsBody(null).ok).toBe(false)
    expect(validateMandatorySkillsBody('x').ok).toBe(false)
    expect(validateMandatorySkillsBody(['a']).ok).toBe(false)
    expect(validateMandatorySkillsBody(42).ok).toBe(false)
  })
  it('未知 phase → 拒绝', () => {
    const r = validateMandatorySkillsBody({ phase: 'nope', track: 'backend', skills: [] })
    expect(r.ok).toBe(false)
  })
  it('archive 相位 → 拒绝（archive 无强制 skill，manifest.yaml 设计如此）', () => {
    const r = validateMandatorySkillsBody({ phase: 'archive', track: 'backend', skills: [] })
    expect(r.ok).toBe(false)
  })
  it('未知/不可写 track（chat / _all）→ 拒绝', () => {
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'chat', skills: [] }).ok).toBe(false)
    expect(validateMandatorySkillsBody({ phase: 'build', track: '_all', skills: [] }).ok).toBe(false)
  })
  it('skills 非数组 → 拒绝', () => {
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: 'a' }).ok).toBe(false)
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend' }).ok).toBe(false)
  })
  it('skills 超过上限（50）→ 拒绝', () => {
    const many = Array.from({ length: 51 }, (_, i) => `s${i}`)
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: many }).ok).toBe(false)
  })
  it('50 项恰好合法（边界值）', () => {
    const exactly = Array.from({ length: 50 }, (_, i) => `s${i}`)
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: exactly }).ok).toBe(true)
  })
  it('含非法字符 token（逗号/方括号/换行/空格/#/引号/空串）→ 逐一拒绝', () => {
    const bads = ['a,b', 'a]b', 'a[b', 'a\nb', 'a b', '', '#comment', "a'b", 'a"b', '-leading-dash']
    for (const bad of bads) {
      const r = validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: [bad] })
      expect(r.ok, `token ${JSON.stringify(bad)} 应被拒绝`).toBe(false)
    }
  })
  it('重复 token → 拒绝', () => {
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: ['a', 'a'] }).ok).toBe(false)
  })
  it('空 skills 数组合法（显式清空，覆盖 _all 兜底是有意义的状态）', () => {
    expect(validateMandatorySkillsBody({ phase: 'build', track: 'backend', skills: [] }).ok).toBe(true)
  })
})

describe('writeMandatorySkills —— 外科手术式改盘 + 真 kernel 往返解析（GOAL C9：零 mock）', () => {
  it('改写已存在的 key：值真变、其余条目逐字不变、总行数不变', async () => {
    const manifestPath = await makeTempManifest()
    const before = await readFile(manifestPath, 'utf8')

    await writeMandatorySkills(manifestPath, 'build', 'backend', ['x', 'y'])

    const after = await readFile(manifestPath, 'utf8')
    expect(after).not.toBe(before)
    expect(after.split('\n').length).toBe(before.split('\n').length) // 只改值，不增删行

    const reparsed = loadManifest(manifestPath)
    expect(reparsed.mandatorySkills.build.backend).toEqual(['x', 'y'])
    // 其余条目逐字不变（spot check）
    expect(reparsed.mandatorySkills.explore.pm).toEqual(['superpowers:brainstorming', 'grill-with-docs'])
    expect(reparsed.mandatorySkills.open._all).toEqual(['opsx:propose|openspec-propose'])
    expect(reparsed.mandatorySkills.ship.backend).toEqual([
      'opsx:apply|openspec-apply-change',
      'superpowers:finishing-a-development-branch',
      'commit-commands:commit-push-pr',
    ])
  })

  it('新增此前不存在的 key（open.pm 目前仅有 _all 兜底）：写入后独立生效、_all 不受影响', async () => {
    const manifestPath = await makeTempManifest()
    expect(loadManifest(manifestPath).mandatorySkills.open.pm).toBeUndefined()

    await writeMandatorySkills(manifestPath, 'open', 'pm', ['custom-skill'])

    const reparsed = loadManifest(manifestPath)
    expect(reparsed.mandatorySkills.open.pm).toEqual(['custom-skill'])
    expect(reparsed.mandatorySkills.open._all).toEqual(['opsx:propose|openspec-propose'])

    // 小节尾部的说明性注释逐字保留（未被新条目插入打断/覆盖）
    const text = await readFile(manifestPath, 'utf8')
    expect(text).toContain('# archive 无强制 skill（归档不 gate skill）——不声明即空表')
    // 其它顶层小节（router_patterns/breadcrumb 等）不受影响 —— 整份仍可被 kernel 完整解析
    expect(reparsed.routerPatterns.frontend).toContain('React')
    expect(reparsed.breadcrumbs.build).toContain('TDD')
  })

  it('空数组显式覆盖：写 [] 后不再回退 _all（三级回退语义的写入侧验证）', async () => {
    const manifestPath = await makeTempManifest()
    await writeMandatorySkills(manifestPath, 'open', 'backend', [])
    const reparsed = loadManifest(manifestPath)
    expect(reparsed.mandatorySkills.open.backend).toEqual([])
  })

  it('并发两次不同 key 写入互不覆盖丢失（真并发 + kernel withLock 真锁）', async () => {
    const manifestPath = await makeTempManifest()
    await Promise.all([
      writeMandatorySkills(manifestPath, 'spec', 'pm', ['concurrent-a']),
      writeMandatorySkills(manifestPath, 'verify', 'frontend', ['concurrent-b']),
    ])
    const reparsed = loadManifest(manifestPath)
    expect(reparsed.mandatorySkills.spec.pm).toEqual(['concurrent-a'])
    expect(reparsed.mandatorySkills.verify.frontend).toEqual(['concurrent-b'])
  })

  it('manifest 缺 mandatory_skills 小节 → 拒写，原文件零改动、不留临时文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pl-cfg-nosec-'))
    const manifestPath = join(dir, 'manifest.yaml')
    const stub = [
      'phases:', '  - open', '  - archive',
      'transitions:', '  open: [archive]', '  archive: [archive]',
      'review_phases: []',
      '',
    ].join('\n')
    await writeFile(manifestPath, stub, 'utf8')

    await expect(writeMandatorySkills(manifestPath, 'open', 'pm', ['x'])).rejects.toThrow(ConfigError)
    expect(await readFile(manifestPath, 'utf8')).toBe(stub)
    expect(await readdir(dir)).toEqual(['manifest.yaml']) // 无 .tmp-* 残留
  })

  it('小节内含无法识别的条目格式 → 拒写，不盲目追加造成进一步损坏', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pl-cfg-bad-'))
    const manifestPath = join(dir, 'manifest.yaml')
    const stub = [
      'phases:', '  - open', '  - archive',
      'transitions:', '  open: [archive]', '  archive: [archive]',
      'review_phases: []',
      'mandatory_skills:',
      '  this line has no colon-bracket shape',
      '',
    ].join('\n')
    await writeFile(manifestPath, stub, 'utf8')

    await expect(writeMandatorySkills(manifestPath, 'open', 'pm', ['x'])).rejects.toThrow(ConfigError)
    expect(await readFile(manifestPath, 'utf8')).toBe(stub)
    expect(await readdir(dir)).toEqual(['manifest.yaml'])
  })

  it('写手本身拒绝非法字符 token（纵深防线：即便直调、绕过上层校验也不产生可注入内容）', async () => {
    const manifestPath = await makeTempManifest()
    const before = await readFile(manifestPath, 'utf8')

    await expect(writeMandatorySkills(manifestPath, 'build', 'backend', ['a, evil.key: [x'])).rejects.toThrow(ConfigError)

    expect(await readFile(manifestPath, 'utf8')).toBe(before) // 原文件不受影响
    const dir = join(manifestPath, '..')
    expect(await readdir(dir)).toEqual(['manifest.yaml']) // 未落任何临时文件
  })

  it('写手拒绝非法 phase/track 标识（即便调用方绕过 validateMandatorySkillsBody）', async () => {
    const manifestPath = await makeTempManifest()
    await expect(writeMandatorySkills(manifestPath, '../evil', 'backend', ['x'])).rejects.toThrow(ConfigError)
    await expect(writeMandatorySkills(manifestPath, 'build', '../evil', ['x'])).rejects.toThrow(ConfigError)
  })
})
