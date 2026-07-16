/**
 * BACKLOG #18 · manifest 全派生面测试 —— mandatory/recommended skills、router patterns、
 * gen-router、breadcrumb prose 的真派生用例（GOAL A1；对齐老仓 skills/pipeline/scripts/manifest.py）。
 *
 * C9 真测试纪律：manifest 派生是纯函数 → 真测试 = 真读 templates/manifest.yaml → 真 loadManifest →
 * 断言真实派生输出。改 yaml 数据 → 派生随之变（单一真相源钉死，非硬编码回归锚——正是老仓
 * review_phases 半接线欠账的反面证据：数据即行为，零硬编码）。真文件、真解析，不需 mock。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHASES } from '../types.js'
import { loadManifest, ManifestError, skillsFor, genRouterSh } from './manifest.js'

/** 仓库根 templates/manifest.yaml（相对本文件定位，不依赖 cwd） */
const TEMPLATE_MANIFEST = fileURLToPath(new URL('../../../../templates/manifest.yaml', import.meta.url))

/** 写一个含全部合法结构（phases/transitions/review_phases）+ 追加自定义节的临时 manifest */
function writeManifest(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-derive-'))
  const p = join(dir, 'manifest.yaml')
  const base = [
    'phases:',
    ...PHASES.map((ph) => `  - ${ph}`),
    'transitions:',
    '  open: [explore]',
    '  explore: [spec]',
    '  spec: [build]',
    '  build: [verify]',
    '  verify: [ship, build]',
    '  ship: [archive]',
    '  archive: [archive]',
    'review_phases: [explore, spec, verify]',
  ].join('\n')
  writeFileSync(p, base + '\n' + body + '\n')
  return p
}

describe('派生面 · mandatory / recommended skills（evidence 派生，对齐 manifest.py:evidence 346-355）', () => {
  it('真读 templates：per phase×track 强制 skill 表逐字派生', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    expect(m.mandatorySkills.explore.pm).toEqual(['superpowers:brainstorming', 'grill-with-docs'])
    expect(m.mandatorySkills.explore.backend).toEqual([
      'opsx:explore|openspec-explore',
      'superpowers:brainstorming',
      'grill-with-docs',
      'improve-codebase-architecture',
    ])
    expect(m.mandatorySkills.build.backend).toEqual([
      'superpowers:writing-plans',
      'superpowers:test-driven-development',
    ])
    // a|b 备选 token 逐字保留（消费方自行择一），archive 无强制 skill
    expect(m.mandatorySkills.verify.frontend).toContain('verify|verification-loop')
    expect(m.mandatorySkills.archive).toEqual({})
  })

  it('真读 templates：per phase×track 推荐 skill 表逐字派生', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    expect(m.recommendedSkills.explore.pm).toEqual(['pipeline-researcher'])
    expect(m.recommendedSkills.build.frontend).toEqual([
      'react-patterns',
      'react-best-practices',
      'tailwind-css-patterns',
      'shadcn-ui',
      'hallmark',
    ])
  })

  it('skillsFor：per-track → _all 兜底 → 空，三级回退与老 evidence 同语义', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    // open 只声明 _all，任一 track 都命中 _all 兜底
    expect(skillsFor(m.mandatorySkills, 'open', 'backend')).toEqual(['opsx:propose|openspec-propose'])
    expect(skillsFor(m.mandatorySkills, 'open', 'pm')).toEqual(['opsx:propose|openspec-propose'])
    // per-track 优先于 _all
    expect(skillsFor(m.mandatorySkills, 'explore', 'pm')).toEqual(['superpowers:brainstorming', 'grill-with-docs'])
    // 无声明 → 空
    expect(skillsFor(m.recommendedSkills, 'archive', 'backend')).toEqual([])
    expect(skillsFor(m.mandatorySkills, 'verify', 'chat')).toEqual([])
  })

  it('单一真相源钉死：改 yaml 的 skill 数据 → 派生随之变（非硬编码）', () => {
    const p = writeManifest(
      [
        'mandatory_skills:',
        '  build.backend: [only-this-one]',
        '  spec._all: [shared-a, shared-b]',
        'recommended_skills:',
        '  build.pm: [rec-x]',
      ].join('\n'),
    )
    const m = loadManifest(p)
    expect(m.mandatorySkills.build.backend).toEqual(['only-this-one'])
    // _all 兜底：spec 的任意 track 命中 shared
    expect(skillsFor(m.mandatorySkills, 'spec', 'frontend')).toEqual(['shared-a', 'shared-b'])
    expect(m.recommendedSkills.build.pm).toEqual(['rec-x'])
    // 未声明的 phase → 空（不继承 templates 的硬编码值）
    expect(m.mandatorySkills.explore).toEqual({})
  })

  it('fail-loud：mandatory_skills 未知 track → ManifestError（老 evidence fail-open 的改进）', () => {
    const p = writeManifest(['mandatory_skills:', '  build.wat: [x]'].join('\n'))
    expect(() => loadManifest(p)).toThrow(ManifestError)
  })

  it('fail-loud：mandatory_skills 未声明相位 → ManifestError', () => {
    const p = writeManifest(['mandatory_skills:', '  bogus.pm: [x]'].join('\n'))
    expect(() => loadManifest(p)).toThrow(ManifestError)
  })

  it('缺 skill 节（最小 manifest）→ 空表且不抛（向后兼容）', () => {
    const p = writeManifest('')
    const m = loadManifest(p)
    for (const ph of PHASES) {
      expect(m.mandatorySkills[ph]).toEqual({})
      expect(m.recommendedSkills[ph]).toEqual({})
    }
  })
})

describe('派生面 · router patterns（Track 评分正则；对齐 manifest.py:gen_router_sh 890-898）', () => {
  it('真读 templates：三 Track 正则逐字派生（含特殊正则字符）', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    expect(m.routerPatterns.frontend).toContain('前端')
    expect(m.routerPatterns.frontend).toContain('React')
    expect(m.routerPatterns.frontend).toContain('\\.tsx')
    expect(m.routerPatterns.backend).toContain('后端')
    expect(m.routerPatterns.backend).toContain('GraphQL')
    // 内部有意义空格（"Go " 词界）在单引号内保真
    expect(m.routerPatterns.backend).toContain('Go |Python ')
    expect(m.routerPatterns.pm).toContain('竞品')
    expect(m.routerPatterns.pm).toContain('user persona')
  })

  it('单一真相源钉死：改 yaml 的 router_patterns → 派生随之变', () => {
    const p = writeManifest(
      [
        'router_patterns:',
        "  frontend: '(tsx|vue)'",
        "  backend: '(api|db)'",
        "  pm: '(prd|市场)'",
      ].join('\n'),
    )
    const m = loadManifest(p)
    expect(m.routerPatterns).toEqual({ frontend: '(tsx|vue)', backend: '(api|db)', pm: '(prd|市场)' })
  })

  it('缺 router_patterns 节 → 三值空串（对齐老 gen_router_sh rp.get(k, "")）', () => {
    const m = loadManifest(writeManifest(''))
    expect(m.routerPatterns).toEqual({ frontend: '', backend: '', pm: '' })
  })

  it('fail-loud：router_patterns 未知 track → ManifestError', () => {
    const p = writeManifest(['router_patterns:', "  fullstack: '(x)'"].join('\n'))
    expect(() => loadManifest(p)).toThrow(ManifestError)
  })
})

describe('派生面 · gen-router（bash 生成；消费方 = hooks/router-gen.mjs:62 与 cli gen-router.ts:32）', () => {
  it('genRouterSh：FE/BE/PM_PATTERN 单引号安全赋值，逐值来自派生', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    const sh = genRouterSh(m.routerPatterns)
    expect(sh).toContain('# AUTO-GENERATED')
    expect(sh).toContain(`FE_PATTERN='${m.routerPatterns.frontend}'`)
    expect(sh).toContain(`BE_PATTERN='${m.routerPatterns.backend}'`)
    expect(sh).toContain(`PM_PATTERN='${m.routerPatterns.pm}'`)
  })

  it("genRouterSh：单引号注入防护（' → '\\''）", () => {
    const sh = genRouterSh({ frontend: "a'b", backend: '', pm: '' })
    expect(sh).toContain("FE_PATTERN='a'\\''b'")
  })
})

describe('派生面 · breadcrumb prose（对齐 manifest.py breadcrumb 子命令 1031-1037）', () => {
  it('真读 templates：7 相位 breadcrumb 均非空且多行 prose', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    for (const ph of PHASES) {
      expect(m.breadcrumbs[ph], `breadcrumb for ${ph}`).toBeTruthy()
    }
    expect(m.breadcrumbs.open).toContain('立项')
    expect(m.breadcrumbs.explore).toContain('调研')
    // block scalar 保多行结构
    expect(m.breadcrumbs.build!.split('\n').length).toBeGreaterThan(1)
    // 末尾换行被 rstrip（对齐老 CLI `bc.rstrip("\n")`）
    expect(m.breadcrumbs.verify!.endsWith('\n')).toBe(false)
  })

  it('单一真相源钉死：改 yaml 的 breadcrumb block scalar → 派生逐字变（含内部换行/空行）', () => {
    const p = writeManifest(
      [
        'breadcrumb:',
        '  open: |',
        '    第一行内容',
        '    第二行内容',
        '',
        '    段落二',
        '  build: |',
        '    仅一行',
      ].join('\n'),
    )
    const m = loadManifest(p)
    expect(m.breadcrumbs.open).toBe('第一行内容\n第二行内容\n\n段落二')
    expect(m.breadcrumbs.build).toBe('仅一行')
    // 未声明的相位 breadcrumb 缺省 undefined
    expect(m.breadcrumbs.verify).toBeUndefined()
  })

  it('缺 breadcrumb 节 → 空对象且不抛', () => {
    const m = loadManifest(writeManifest(''))
    expect(m.breadcrumbs).toEqual({})
  })

  it('fail-loud：breadcrumb 未声明相位 → ManifestError', () => {
    const p = writeManifest(['breadcrumb:', '  bogus: |', '    x'].join('\n'))
    expect(() => loadManifest(p)).toThrow(ManifestError)
  })
})

describe('派生面 · 回归锚（既有 phases/transitions/reviewPhases 派生不受新增节影响）', () => {
  it('templates 加派生节后，核心三派生仍稳定', () => {
    const m = loadManifest(TEMPLATE_MANIFEST)
    expect(m.phases).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    expect(m.transitions.verify).toEqual(['ship', 'build'])
    expect(m.reviewPhases).toEqual(['explore', 'spec', 'verify'])
  })
})
