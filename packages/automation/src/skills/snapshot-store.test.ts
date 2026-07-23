/**
 * buildCanonicalManifest / materializeSkillSnapshot 真文件系统测试（H10-T4，设计定稿 §3 步骤 3-6；
 * H10 r1 复审阻断2/4 返工——见文件内各处 "H10 r1 复审" 标注）——mkdtemp 真目录，零 mock fs。
 * 覆盖：完整目录（含 SKILL.md 引用的脚本资源）、路径排序、可执行位、内部 symlink 解引用为普通
 * 文件、目录逃逸 symlink 拒绝、symlink 环拒绝、socket 文件拒绝、不可读文件拒绝、canonical（不同
 * 宿主路径/不同 mtime 不影响 hash）、双遍稳定性（一次输入变化可重试成功、持续变化两遍皆不稳定报
 * unstable）、CAS 原子发布 + 幂等、既有 CAS 被篡改时逐字节校验出 corrupt（绝不覆盖）、skill id
 * 路径逃逸字符拒绝；H10 r1 复审新增：SKILL.md 存在且非空门槛、symlink TOCTOU（判定为普通文件/
 * 内部 symlink 解引用之后、实际读取之前被替换）拒绝跟随、既有 CAS 内非普通文件条目拒绝跟随
 * symlink 消费、既有（含空）CAS 目标目录绝不被 rename 静默替换、per-digest 并发发布锁 + commit
 * marker、provenance 落盘并纳入聚合 digest 覆盖。
 */
import { createServer } from 'node:net'
import { chmod, link, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCanonicalManifest,
  materializeSkillSnapshot,
  SkillContentInvalidError,
  SkillSnapshotCorruptError,
  SkillSnapshotSourceUnstableError,
} from './snapshot-store.js'
import type { SkillSnapshotProvenance } from './types.js'

describe('buildCanonicalManifest', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'skill-manifest-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('完整目录：嵌套文件/子目录全部纳入，含 SKILL.md 引用的脚本资源（不止 Markdown）', async () => {
    const dir = join(root, 'skill')
    await mkdir(join(dir, 'scripts'), { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(dir, 'scripts', 'run.sh'), '#!/bin/sh\necho hi\n', 'utf8')
    const manifest = await buildCanonicalManifest('demo', dir)
    expect(manifest.skillId).toBe('demo')
    expect(manifest.files.map((f) => f.relativePath)).toEqual(['SKILL.md', 'scripts/run.sh'])
    expect(manifest.treeSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('排序：无论创建顺序如何，files 按相对路径码点升序', async () => {
    const dir = join(root, 'skill')
    await mkdir(join(dir, 'sub'), { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(dir, 'z.txt'), 'z', 'utf8')
    await writeFile(join(dir, 'a.txt'), 'a', 'utf8')
    await writeFile(join(dir, 'sub', 'm.txt'), 'm', 'utf8')
    await writeFile(join(dir, 'sub', 'b.txt'), 'b', 'utf8')
    const manifest = await buildCanonicalManifest('demo', dir)
    // 大写字母码点小于小写字母——'SKILL.md' 排在全部小写文件名之前。
    expect(manifest.files.map((f) => f.relativePath)).toEqual(['SKILL.md', 'a.txt', 'sub/b.txt', 'sub/m.txt', 'z.txt'])
  })

  it('可执行位：chmod 755 记 true，644 记 false', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(dir, 'run.sh'), '#!/bin/sh\n', 'utf8')
    await chmod(join(dir, 'run.sh'), 0o755)
    await writeFile(join(dir, 'doc.md'), '# doc', 'utf8')
    await chmod(join(dir, 'doc.md'), 0o644)
    const manifest = await buildCanonicalManifest('demo', dir)
    const byPath = Object.fromEntries(manifest.files.map((f) => [f.relativePath, f.executable]))
    expect(byPath['run.sh']).toBe(true)
    expect(byPath['doc.md']).toBe(false)
  })

  it('内部 symlink 解引用为普通文件：与目标内容 hash 一致，不作为特殊类型出现', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(dir, 'real.md'), '# real content', 'utf8')
    await symlink(join(dir, 'real.md'), join(dir, 'alias.md'))
    const manifest = await buildCanonicalManifest('demo', dir)
    const byPath = Object.fromEntries(manifest.files.map((f) => [f.relativePath, f]))
    expect(manifest.files.map((f) => f.relativePath)).toEqual(['SKILL.md', 'alias.md', 'real.md'])
    expect(byPath['alias.md']?.sha256).toBe(byPath['real.md']?.sha256)
  })

  it("skill 内容根缺少 SKILL.md → SkillContentInvalidError（H10 r1 复审阻断2/4 第5点：SKILL.md 是" +
    ' skill 树的有效性门槛，不是随便一个目录都能当 skill 物化/参与多根折叠）', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'other.md'), '# not the entry doc', 'utf8')
    await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('SKILL.md 存在但是空文件 → SkillContentInvalidError（空文档不构成有效 skill 树）', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '', 'utf8')
    await writeFile(join(dir, 'scripts.sh'), '#!/bin/sh\n', 'utf8')
    await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it("skill id 恰为单独 '.' → SkillContentInvalidError（H10 r1 复审阻断2/4：'.' 会让内容根被当成" +
    '整个 skill 树本身，不是某个具体子目录）', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await expect(buildCanonicalManifest('.', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('symlink TOCTOU（普通文件分支）：文件在"判定为普通文件"之后、实际读取之前被替换为指向根外' +
    '内容的 symlink → 拒绝跟随，不静默读取替换后的目标（H10 r1 复审阻断2/4 第3点）', async () => {
    const dir = join(root, 'skill')
    const outside = join(root, 'outside')
    await mkdir(dir, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET', 'utf8')
    await writeFile(join(dir, 'doc.md'), 'original safe content', 'utf8')

    await expect(
      buildCanonicalManifest('demo', dir, {
        onBeforeReadFile: async (relPath, absPath) => {
          if (relPath === 'doc.md') {
            await rm(absPath, { force: true })
            await symlink(join(outside, 'secret.txt'), absPath)
          }
        },
      }),
    ).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('祖先目录 TOCTOU：叶子判定后祖先被换成根外 symlink，即便根外叶子是同 inode hard link 也 fail-closed', async () => {
    const dir = join(root, 'skill')
    const nested = join(dir, 'nested')
    const outside = join(root, 'outside')
    await mkdir(nested, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(nested, 'note.md'), 'same inode', 'utf8')
    await link(join(nested, 'note.md'), join(outside, 'note.md'))

    await expect(
      buildCanonicalManifest('demo', dir, {
        onBeforeReadFile: async (relPath) => {
          if (relPath === 'nested/note.md') {
            await rm(nested, { recursive: true, force: true })
            await symlink(outside, nested)
          }
        },
      }),
    ).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('symlink TOCTOU（内部 symlink 解引用分支）：symlink 目标在通过根内边界校验之后、实际读取之前' +
    '被重新指向根外内容 → 拒绝跟随（H10 r1 复审阻断2/4 第3点：不能只在"判定安全"那一刻校验一次，' +
    '读到的必须是判定时看到的同一个对象）', async () => {
    const dir = join(root, 'skill')
    const outside = join(root, 'outside')
    await mkdir(dir, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await writeFile(join(dir, 'real.md'), '# real content', 'utf8')
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET', 'utf8')
    await symlink(join(dir, 'real.md'), join(dir, 'alias.md')) // 初始指向根内安全目标，通过边界校验

    await expect(
      buildCanonicalManifest('demo', dir, {
        onBeforeReadFile: async (relPath, absPath) => {
          if (relPath === 'alias.md') {
            await rm(absPath, { force: true })
            await symlink(join(outside, 'secret.txt'), absPath) // 边界校验通过后、读取前，改指向根外
          }
        },
      }),
    ).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('目录逃逸 symlink → SkillContentInvalidError', async () => {
    const dir = join(root, 'skill')
    const outside = join(root, 'outside')
    await mkdir(dir, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'secret.txt'), 'nope', 'utf8')
    await symlink(join(outside, 'secret.txt'), join(dir, 'escape.txt'))
    await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('symlink 环（指回自身祖先目录）→ SkillContentInvalidError，不无限递归', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await symlink(dir, join(dir, 'loop'))
    await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('socket 文件 → SkillContentInvalidError', async (ctx) => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    const sockPath = join(dir, 's.sock')
    const server = createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(sockPath, () => resolve())
      })
    } catch (e) {
      console.warn(`[HONEST SKIP] 本环境无法创建 unix domain socket（${(e as Error).message}）→ socket 拒绝用例跳过`)
      return ctx.skip()
    }
    try {
      await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('不可读文件 → SkillContentInvalidError（root 用户会绕过权限位，本用例诚实跳过）', async (ctx) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return ctx.skip()
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'secret.md'), 'nope', 'utf8')
    await chmod(join(dir, 'secret.md'), 0o000)
    try {
      await expect(buildCanonicalManifest('demo', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
    } finally {
      await chmod(join(dir, 'secret.md'), 0o644) // 让 afterEach 的 rm -rf 能正常清掉
    }
  })

  it('skill id 含路径逃逸/分隔符字符 → SkillContentInvalidError（id 会直接拼进 CAS 路径段）', async () => {
    const dir = join(root, 'skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '# doc', 'utf8')
    await expect(buildCanonicalManifest('../escape', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
    await expect(buildCanonicalManifest('a/b', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
    await expect(buildCanonicalManifest('', dir)).rejects.toBeInstanceOf(SkillContentInvalidError)
  })

  it('canonical：不同宿主绝对路径 + 不同 mtime，内容相同 → treeSha256 相同', async () => {
    const dirA = join(root, 'host-a', 'skill')
    const dirB = join(root, 'host-b-with-a-much-longer-path-segment', 'skill')
    await mkdir(dirA, { recursive: true })
    await mkdir(dirB, { recursive: true })
    await writeFile(join(dirA, 'SKILL.md'), '# same', 'utf8')
    await writeFile(join(dirB, 'SKILL.md'), '# same', 'utf8')
    await utimes(join(dirB, 'SKILL.md'), new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))

    const a = await buildCanonicalManifest('demo', dirA)
    const b = await buildCanonicalManifest('demo', dirB)
    expect(a.treeSha256).toBe(b.treeSha256)
  })
})

describe('materializeSkillSnapshot', () => {
  let projectRoot: string
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'skill-cas-'))
  })
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  async function makeSkillDir(id: string, docContent: string): Promise<string> {
    const dir = join(projectRoot, 'src-skills', id)
    await mkdir(join(dir, 'scripts'), { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), docContent, 'utf8')
    await writeFile(join(dir, 'scripts', 'run.sh'), '#!/bin/sh\necho ok\n', 'utf8')
    await chmod(join(dir, 'scripts', 'run.sh'), 0o755)
    return dir
  }

  it('完整目录物化（含脚本资源）→ CAS 路径下逐字节可读、digest 为 64 位 hex、首次 reused=false', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const result = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })

    expect(result.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(result.reused).toBe(false)
    expect(result.casDir).toBe(join(projectRoot, '.pipeline', 'loops', 'skill-snapshots', 'sha256', result.digest))

    const doc = await readFile(join(result.casDir, 'skills', 'demo-skill', 'SKILL.md'), 'utf8')
    expect(doc).toBe('# demo')
    const scriptStat = await stat(join(result.casDir, 'skills', 'demo-skill', 'scripts', 'run.sh'))
    expect((scriptStat.mode & 0o111) !== 0).toBe(true)
  })

  it('CAS 幂等：同内容二次物化 → 相同 digest、reused=true、不报错不覆盖', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const first = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    const second = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    expect(second.digest).toBe(first.digest)
    expect(second.reused).toBe(true)
  })

  it('同 digest 并发发布 → 全部成功且仅一个 publisher，其余等待 commit 后幂等复用', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const results = await Promise.all(
      Array.from({ length: 8 }, () => materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })),
    )

    expect(new Set(results.map((result) => result.digest)).size).toBe(1)
    expect(results.filter((result) => !result.reused)).toHaveLength(1)
    expect(results.filter((result) => result.reused)).toHaveLength(7)
  })

  it('既有 CAS 目录内容被篡改 → 同源再次物化逐字节验出不一致，SkillSnapshotCorruptError，绝不覆盖', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const first = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    const tamperedPath = join(first.casDir, 'skills', 'demo-skill', 'SKILL.md')
    await writeFile(tamperedPath, '# TAMPERED', 'utf8')

    await expect(
      materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot }),
    ).rejects.toBeInstanceOf(SkillSnapshotCorruptError)
    // 拒绝动作没有"顺手修复"掉篡改证据——既有目录必须原样保留
    expect(await readFile(tamperedPath, 'utf8')).toBe('# TAMPERED')
  })

  it('既有同 digest 的 CAS 目标目录若为空（不是本次调用产出）→ 绝不被 rename 静默替换，判 corrupt' +
    '（H10 r1 复审阻断2/4 第2点：持发布锁后用独占 mkdir 认领；命中任何既有内容——哪怕是空目录——' +
    '都要求完整 commit marker 后才逐字节验证，不使用 rename 覆盖）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const first = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })

    // 清空既有目录内容但保留目录本身——模拟"这个 digest 路径下已经有一个目录，但不是这次调用
    // 产出、也没有完整内容"（无论这个空目录从何而来，都不该被 rename 悄悄替换）。
    await rm(first.casDir, { recursive: true, force: true })
    await mkdir(first.casDir, { recursive: true })

    await expect(
      materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot }),
    ).rejects.toBeInstanceOf(SkillSnapshotCorruptError)
    // 既有（空）目录没有被"顺手"填成看起来正确的内容——拒绝动作前保持原样。
    expect(await readdir(first.casDir)).toEqual([])
  })

  it('既有 CAS 目录内某文件被替换为 symlink（即便目标字节内容相同）→ 仍判 corrupt，不当普通文件' +
    '用跟随 symlink 的方式复用（H10 r1 复审阻断2/4 第4点：既有 CAS 校验不得对非目录条目使用会' +
    '跟随 symlink 的 readFile/stat）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const first = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    const skillMdPath = join(first.casDir, 'skills', 'demo-skill', 'SKILL.md')
    const original = await readFile(skillMdPath, 'utf8')
    const elsewhere = join(projectRoot, 'elsewhere-same-bytes.md')
    await writeFile(elsewhere, original, 'utf8') // 字节与原内容完全相同的另一份文件
    await rm(skillMdPath)
    await symlink(elsewhere, skillMdPath) // 用 symlink 替换既有 CAS 内的普通文件

    await expect(
      materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot }),
    ).rejects.toBeInstanceOf(SkillSnapshotCorruptError)
  })

  it('多 skill 输入 → 各自命名空间下的文件都在场', async () => {
    const dirA = await makeSkillDir('skill-a', '# a')
    const dirB = await makeSkillDir('skill-b', '# b')
    const result = await materializeSkillSnapshot(
      [
        { skillId: 'skill-a', contentDir: dirA },
        { skillId: 'skill-b', contentDir: dirB },
      ],
      { projectRoot },
    )
    expect(result.manifests.map((m) => m.skillId).sort()).toEqual(['skill-a', 'skill-b'])
    await expect(stat(join(result.casDir, 'skills', 'skill-a', 'SKILL.md'))).resolves.toBeDefined()
    await expect(stat(join(result.casDir, 'skills', 'skill-b', 'SKILL.md'))).resolves.toBeDefined()
  })

  it('空输入 → 合法的空快照（profile 合法但有效 skill 集为空，不是未接线）', async () => {
    const result = await materializeSkillSnapshot([], { projectRoot })
    expect(result.manifests).toEqual([])
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/)
    const second = await materializeSkillSnapshot([], { projectRoot })
    expect(second.digest).toBe(result.digest)
    expect(second.reused).toBe(true)
  })

  it('复制期间源变化一次 → 重试一次后即稳定成功，快照反映落定后的内容', async () => {
    const dir = await makeSkillDir('flaky-skill', '# v1')
    let mutated = false
    const result = await materializeSkillSnapshot([{ skillId: 'flaky-skill', contentDir: dir }], {
      projectRoot,
      onAfterBeforeDigest: async () => {
        if (!mutated) {
          mutated = true
          await writeFile(join(dir, 'SKILL.md'), '# v2', 'utf8')
        }
      },
    })
    expect(result.reused).toBe(false)
    const doc = await readFile(join(result.casDir, 'skills', 'flaky-skill', 'SKILL.md'), 'utf8')
    expect(doc).toBe('# v2')
  })

  it('复制期间源持续变化（每次尝试都变）→ 两遍皆不稳定，SkillSnapshotSourceUnstableError', async () => {
    const dir = await makeSkillDir('flaky-skill', '# v1')
    let counter = 0
    await expect(
      materializeSkillSnapshot([{ skillId: 'flaky-skill', contentDir: dir }], {
        projectRoot,
        onAfterBeforeDigest: async () => {
          counter += 1
          await writeFile(join(dir, 'SKILL.md'), `# v${counter + 1}`, 'utf8')
        },
      }),
    ).rejects.toBeInstanceOf(SkillSnapshotSourceUnstableError)
  })

  // H10 r1 复审阻断2/4 第1/2点（D4）：canonical descriptor（manifest.json）扩为完整 provenance，
  // 并纳入聚合 digest 覆盖——manifest 内容参与 snapshot_sha256 计算，改 manifest 必然变 digest。
  // provenance 字段规范见 types.ts::SkillSnapshotProvenance 头注（三处必须一致：CAS descriptor /
  // ledger SkillBundleSnapshotRecord / PreparedExecutionContext.skillBundle——本文件只验 CAS
  // descriptor 半边，另两处填充接线是 H10 任务B1）。
  function makeProvenance(overrides: Partial<SkillSnapshotProvenance> = {}): SkillSnapshotProvenance {
    return {
      loop_id: 'loop-a',
      policy_epoch: 'epoch-1',
      skill_bundle_id: 'bundle-a',
      attempt_id: 'att-1',
      reservation_id: 'res-1',
      workflow_run_id: 'run-1',
      workflow: 'default',
      step: 'build',
      track: 'backend',
      coordinate_digest: 'coord-digest-abc',
      resolution_source: 'default',
      slots: [{ alternatives: ['demo-skill', 'demo-skill-fallback'], concrete_skill_id: 'demo-skill', tree_sha256: 'a'.repeat(64) }],
      ...overrides,
    }
  }

  it('携带 provenance 物化 → manifest.json 落盘完整 provenance（调用方传入什么就诚实落盘什么）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const provenance = makeProvenance()
    const result = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot, provenance })
    const manifest = JSON.parse(await readFile(join(result.casDir, 'manifest.json'), 'utf8')) as { provenance?: unknown }
    expect(manifest.provenance).toEqual(provenance)
  })

  it('不传 provenance → manifest.json 不含 provenance 字段（省略即诚实表达"未接线"，不伪造空对象）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const result = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    const manifest = JSON.parse(await readFile(join(result.casDir, 'manifest.json'), 'utf8')) as { provenance?: unknown }
    expect(manifest.provenance).toBeUndefined()
  })

  it('改任一 provenance 字段（文件内容不变）→ digest 必然变化（杀"改 manifest 保 digest"攻击的' +
    '前提：digest 本身必须先对 provenance 敏感）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const withRunA = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], {
      projectRoot, provenance: makeProvenance({ workflow_run_id: 'run-A' }),
    })
    const withRunB = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], {
      projectRoot, provenance: makeProvenance({ workflow_run_id: 'run-B' }),
    })
    expect(withRunB.digest).not.toBe(withRunA.digest)

    const withDifferentSlots = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], {
      projectRoot,
      provenance: makeProvenance({ slots: [{ alternatives: ['demo-skill'], concrete_skill_id: 'demo-skill', tree_sha256: 'b'.repeat(64) }] }),
    })
    expect(withDifferentSlots.digest).not.toBe(withRunA.digest)
  })

  it('省略 provenance 与传入具体 provenance → digest 不同（省略不等价于任何具体取值）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const withoutProvenance = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot })
    const withProvenance = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], {
      projectRoot, provenance: makeProvenance(),
    })
    expect(withProvenance.digest).not.toBe(withoutProvenance.digest)
  })

  it('相同 provenance 二次物化 → 相同 digest、reused=true（provenance 不破坏既有幂等语义）', async () => {
    const dir = await makeSkillDir('demo-skill', '# demo')
    const provenance = makeProvenance()
    const first = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot, provenance })
    const second = await materializeSkillSnapshot([{ skillId: 'demo-skill', contentDir: dir }], { projectRoot, provenance })
    expect(second.digest).toBe(first.digest)
    expect(second.reused).toBe(true)
  })
})
