/**
 * SkillContentLocator 真文件系统测试（H10-T4，设计定稿 §2/§3 步骤 3）——mkdtemp 真目录，零 mock fs。
 * 覆盖：单根命中、多根仅一根命中（其余根缺目录也不报错）、全不命中 fail-loud、顶层安装位
 * symlink（`npx skills add` 常见装法）仍可定位、多根内容 hash 全同折叠、多根内容分歧歧义拒绝、
 * 错误分类（H10 r1 复审阻断4：EACCES/悬空 symlink/存在但非目录 一律 fail-loud，绝不伪装成
 * not-found 静默跳过）。
 */
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFsSkillContentLocator,
  SkillContentAccessError,
  SkillContentInvalidError,
  SkillContentNotFoundError,
  SkillContentSourceAmbiguousError,
} from './content-locator.js'
import { materializeSkillSnapshot } from './snapshot-store.js'

describe('createFsSkillContentLocator', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'skill-locator-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function makeSkillDir(rootDir: string, id: string, content: string): Promise<string> {
    const dir = join(rootDir, id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), content, 'utf8')
    return dir
  }

  it('单根命中 → 返回该目录（已穿过 realpath）', async () => {
    const rootA = join(root, 'root-a')
    const dir = await makeSkillDir(rootA, 'tenon-build', '# build')
    const locator = createFsSkillContentLocator([rootA])
    const located = await locator.locate('tenon-build')
    expect(located.skillId).toBe('tenon-build')
    expect(located.contentDir).toBe(await realpath(dir))
  })

  it('多根仅一根命中 → 返回命中的那个；不存在的根（缺目录）不报错，只是跳过', async () => {
    const rootA = join(root, 'root-a')
    const rootB = join(root, 'root-b-does-not-exist') // 故意不建
    const dir = await makeSkillDir(rootA, 'tenon-build', '# build')
    const locator = createFsSkillContentLocator([rootB, rootA])
    const located = await locator.locate('tenon-build')
    expect(located.contentDir).toBe(await realpath(dir))
  })

  it('所有根都不命中 → SkillContentNotFoundError（fail-loud，不当空 bundle）', async () => {
    const rootA = join(root, 'root-a')
    await mkdir(rootA, { recursive: true })
    const locator = createFsSkillContentLocator([rootA])
    await expect(locator.locate('missing-skill')).rejects.toBeInstanceOf(SkillContentNotFoundError)
  })

  it('顶层安装位是 symlink → 仍定位到真实目录（不是可能悬空的链接本身）', async () => {
    const realStore = join(root, 'real-store', 'tenon-build')
    await mkdir(realStore, { recursive: true })
    await writeFile(join(realStore, 'SKILL.md'), '# build', 'utf8')
    const installedRoot = join(root, 'installed')
    await mkdir(installedRoot, { recursive: true })
    await symlink(realStore, join(installedRoot, 'tenon-build'))

    const locator = createFsSkillContentLocator([installedRoot])
    const located = await locator.locate('tenon-build')
    expect(located.contentDir).toBe(await realpath(realStore))
  })

  it('多根内容 hash 完全相同 → 折叠，不报歧义（不依赖返回哪一个根，两个都是合法答案）', async () => {
    const rootA = join(root, 'root-a')
    const rootB = join(root, 'root-b')
    const dirA = await makeSkillDir(rootA, 'shared-skill', '# same content\n')
    const dirB = await makeSkillDir(rootB, 'shared-skill', '# same content\n')

    const locator = createFsSkillContentLocator([rootA, rootB])
    const located = await locator.locate('shared-skill')
    expect([await realpath(dirA), await realpath(dirB)]).toContain(located.contentDir)
  })

  it('skill id 含路径分隔符/`..` → SkillContentInvalidError（防 join(root, id) 逃出给定根之外读取）', async () => {
    // base/roots/root-a 是声明的根；base/secret/tenon-build 是根之外、包含真实 SKILL.md 的目录。
    // 若 locate() 不校验 id 形状，`../../secret/tenon-build` 会被 join(root-a, id) 解析到
    // base/secret/tenon-build，让调用方"定位"到根之外的内容——必须在触碰文件系统前就拒绝。
    const rootA = join(root, 'roots', 'root-a')
    await mkdir(rootA, { recursive: true })
    await makeSkillDir(join(root, 'secret'), 'tenon-build', '# should not be reachable')

    const locator = createFsSkillContentLocator([rootA])
    await expect(locator.locate('../../secret/tenon-build')).rejects.toBeInstanceOf(SkillContentInvalidError)
    await expect(locator.locate('a/b')).rejects.toBeInstanceOf(SkillContentInvalidError)
    await expect(locator.locate('')).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('多根内容分歧 → SkillContentSourceAmbiguousError（禁止依赖隐含搜索顺序静默择一）', async () => {
    const rootA = join(root, 'root-a')
    const rootB = join(root, 'root-b')
    await makeSkillDir(rootA, 'conflicted-skill', '# version A\n')
    await makeSkillDir(rootB, 'conflicted-skill', '# version B\n')

    const locator = createFsSkillContentLocator([rootA, rootB])
    await expect(locator.locate('conflicted-skill')).rejects.toBeInstanceOf(SkillContentSourceAmbiguousError)
  })

  it('候选根不可访问（EACCES）→ SkillContentAccessError，不伪装成 not-found 静默跳过（H10 r1 复审阻断4；root 用户绕过权限位，本用例诚实跳过）', async (ctx) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return ctx.skip()
    const rootA = join(root, 'root-a')
    await makeSkillDir(rootA, 'blocked-skill', '# blocked')
    await chmod(rootA, 0o000) // 去掉 search 位——lstat(join(rootA, 'blocked-skill')) 直接 EACCES
    try {
      const locator = createFsSkillContentLocator([rootA])
      await expect(locator.locate('blocked-skill')).rejects.toBeInstanceOf(SkillContentAccessError)
    } finally {
      await chmod(rootA, 0o755) // 让 afterEach 的 rm -rf 能正常清掉
    }
  })

  it('候选路径存在但是悬空 symlink（目标不存在）→ SkillContentAccessError，不当作「这个根没有该 skill」（区别于真 ENOENT）', async () => {
    const rootA = join(root, 'root-a')
    await mkdir(rootA, { recursive: true })
    await symlink(join(rootA, 'nonexistent-target'), join(rootA, 'dangling-skill'))

    const locator = createFsSkillContentLocator([rootA])
    await expect(locator.locate('dangling-skill')).rejects.toBeInstanceOf(SkillContentAccessError)
  })

  it('候选路径存在但成环 symlink（ELOOP）→ SkillContentAccessError', async () => {
    const rootA = join(root, 'root-a')
    await mkdir(rootA, { recursive: true })
    await symlink(join(rootA, 'loop-skill'), join(rootA, 'loop-skill')) // 自环

    const locator = createFsSkillContentLocator([rootA])
    await expect(locator.locate('loop-skill')).rejects.toBeInstanceOf(SkillContentAccessError)
  })

  it('候选路径存在但不是目录（普通文件）→ SkillContentAccessError，不当作未安装静默跳过', async () => {
    const rootA = join(root, 'root-a')
    await mkdir(rootA, { recursive: true })
    await writeFile(join(rootA, 'not-a-dir'), '# oops, this is a file not a skill dir', 'utf8')

    const locator = createFsSkillContentLocator([rootA])
    await expect(locator.locate('not-a-dir')).rejects.toBeInstanceOf(SkillContentAccessError)
  })

  it('候选根真不存在（ENOENT）→ 仍是唯一允许 fail-soft 继续试下一根的情形（回归锚：区别于上面几个 fail-loud 用例）', async () => {
    const rootMissing = join(root, 'root-does-not-exist-at-all')
    const rootA = join(root, 'root-a')
    const dir = await makeSkillDir(rootA, 'tenon-build', '# build')

    const locator = createFsSkillContentLocator([rootMissing, rootA])
    const located = await locator.locate('tenon-build')
    expect(located.contentDir).toBe(await realpath(dir))
  })

  it('损坏候选排在真命中候选之前 → 整体 fail-loud，不因为后面某根能命中就放过前面的损坏根', async () => {
    const rootBroken = join(root, 'root-broken')
    await mkdir(rootBroken, { recursive: true })
    await symlink(join(rootBroken, 'nonexistent-target'), join(rootBroken, 'shared-skill')) // 悬空
    const rootGood = join(root, 'root-good')
    await makeSkillDir(rootGood, 'shared-skill', '# good copy')

    const locator = createFsSkillContentLocator([rootBroken, rootGood])
    await expect(locator.locate('shared-skill')).rejects.toBeInstanceOf(SkillContentAccessError)
  })

  it('端到端：locate 的结果可直接喂给 materializeSkillSnapshot 产出快照', async () => {
    const rootA = join(root, 'root-a')
    await makeSkillDir(rootA, 'tenon-build', '# build\n')
    const locator = createFsSkillContentLocator([rootA])
    const located = await locator.locate('tenon-build')

    const projectRoot = join(root, 'project')
    await mkdir(projectRoot, { recursive: true })
    const result = await materializeSkillSnapshot([located], { projectRoot })
    expect(result.manifests).toHaveLength(1)
    expect(result.manifests[0]?.skillId).toBe('tenon-build')
  })
})
