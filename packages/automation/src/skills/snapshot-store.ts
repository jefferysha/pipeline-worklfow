/**
 * skill 内容的 canonical 清单构建 + CAS 快照物化（H10-T4，设计定稿 §3 步骤 3-6 / §8 任务4；
 * H10 r1 复审阻断2/4 返工——见文件内各处 "H10 r1 复审" 标注）。
 *
 * 两个导出原语：
 *   · buildCanonicalManifest(skillId, sourceDir, hooks?) —— 递归遍历一个 skill 内容根，产出
 *     排序后的规范化文件清单 + 聚合 hash。不带 hooks 时是纯只读 dry-run（content-locator 的
 *     多根折叠/歧义判定、双遍稳定性检查的"前一遍"都用这个）；带 `onFile` 时额外把内容旁路写出
 *     （快照物化"复制这一遍"复用同一套遍历/校验逻辑，不重复写第二份遍历代码）。要求内容根下
 *     必须有非空 SKILL.md（H10 r1 复审阻断2/4 第5点：SKILL.md 是 skill 树的有效性门槛，缺失/
 *     空文档不构成合法 skill——不论是被直接物化，还是被 content-locator 拿去做多根折叠判定）。
 *   · materializeSkillSnapshot(inputs, options) —— 把若干已定位的 skill 内容根，各自做"双遍
 *     source digest"稳定性检查后复制、再把全体聚合成一个不可变 CAS 快照；发布时持 per-digest
 *     目录锁、独占 `mkdir` 最终路径、以 `wx` 逐文件写入，并最后写 commit marker。全程不对最终
 *     路径使用 `rename`。聚合
 *     digest 覆盖逐文件字节、每 skill 小结、以及调用方可选传入的完整 provenance（H10 r1 复审
 *     阻断2/4 第2/4点：manifest.json 任一字段被改都必然改变 digest，堵死"改 manifest 保 digest"
 *     攻击；provenance 字段规范见 types.ts::SkillSnapshotProvenance，生产接线是 H10 任务B1，
 *     本模块只负责"给了就诚实落盘 + 纳入 digest 覆盖"）。
 *
 * 目录校验规则（设计 §3 步骤 4）：拒绝目录逃逸 symlink（真实目标解析到内容根之外）、设备文件/
 * socket/FIFO、不可读文件；内部 symlink（真实目标仍在内容根内）解引用为普通内容——文件目标记成
 * 常规文件条目，目录目标当目录递归（真实路径去重防 symlink 环）。所有"这个 dirent 是普通文件"
 * 的判定都是 TOCTOU-safe 的（H10 r1 复审阻断2/4 第3点）：open 时带 `O_NOFOLLOW`（判定为普通
 * 文件的分支），或对内部 symlink 解引用场景 open 后 fstat 比对 dev/ino（判定安全时记录的目标
 * 与实际打开的目标必须是同一个对象）——绝不会先信一个较早时刻的类型判定、再用会跟随新 symlink
 * 的方式读取。既有 CAS 目录的逐字节复核同样只信 `lstat` 类型、拒绝把既有目录内任何非目录条目
 * 当跟随 symlink 安全可读的普通文件（H10 r1 复审阻断2/4 第4点）。CAS 发布绝不覆盖既有目录内容
 * ——持 per-digest 锁后用独占 `mkdir` 认领最终路径（POSIX `mkdir` 对已存在路径恒失败，不论既有
 * 内容是否为空目录），逐文件 `wx` 写入并以 commit marker 最后提交；认领失败即视为"已有内容"，
 * 只有 marker 完整且逐字节一致才复用，绝不 `rename` 覆盖（H10 r1 复审阻断2/4 第2点）。
 *
 * 本文件不 import scheduler/admission/lifecycle 的任何符号——只产快照原语，编排时点、失败归类
 * 到哪个 SkillBundleFailureReason（`skill-bundle-skill-not-found` / `-content-invalid` /
 * `-source-unstable` / `-snapshot-io` / `-snapshot-corrupt`，设计 §5 表）都是 H10 任务5
 * admission 层的职责——那里按下方错误类的 `_tag` 归类，不在本文件重复定义那张表。
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, realpath, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import {
  isPathSafeSkillId,
  type CanonicalFileEntry,
  type SkillCanonicalManifest,
  type SkillId,
  type SkillSnapshotInput,
  type SkillSnapshotProvenance,
  type SkillSnapshotPublishResult,
} from './types.js'

/**
 * 内容非法：目录逃逸 symlink、symlink 环、设备文件/socket/FIFO、不可读文件、内容根本身不可解析、
 * 或 skill id 含路径不安全字符。对应设计 §5 表 `skill-bundle-content-invalid`（本文件不 import
 * 该字符串闭集，归类是任务5 admission 层按 `_tag==='SkillContentInvalidError'` 做的事）。
 */
export class SkillContentInvalidError extends Error {
  override readonly name = 'SkillContentInvalidError'
  readonly _tag = 'SkillContentInvalidError'
}

/** 双遍 source digest 连续两次都不稳定（复制期间源内容持续变化）。对应设计 §5 表 `skill-bundle-source-unstable`。 */
export class SkillSnapshotSourceUnstableError extends Error {
  override readonly name = 'SkillSnapshotSourceUnstableError'
  readonly _tag = 'SkillSnapshotSourceUnstableError'
}

/** CAS 创建/发布/读取失败（非"已存在但内容不一致"，那归 Corrupt）。对应设计 §5 表 `skill-bundle-snapshot-io`。 */
export class SkillSnapshotIoError extends Error {
  override readonly name = 'SkillSnapshotIoError'
  readonly _tag = 'SkillSnapshotIoError'
}

/** 既有同 digest CAS 目录逐字节验证失败——绝不覆盖，fail-loud。对应设计 §5 表 `skill-bundle-snapshot-corrupt`。 */
export class SkillSnapshotCorruptError extends Error {
  override readonly name = 'SkillSnapshotCorruptError'
  readonly _tag = 'SkillSnapshotCorruptError'
}

const EXEC_BITS = 0o111

/** 最终目录只有在此 marker 最后写入且内容等于 digest 时才算已提交。 */
export const SKILL_SNAPSHOT_COMMIT_MARKER = '.snapshot-committed'
const PUBLISH_LOCK_RETRY_MS = 5
const PUBLISH_LOCK_TIMEOUT_MS = 5_000

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 空文件内容的 sha256——现算而非硬编码 magic hex，避免抄错；用于 SKILL.md 空文件门槛判定。 */
const EMPTY_FILE_SHA256 = sha256Hex(Buffer.alloc(0))

function byRelativePath(a: CanonicalFileEntry, b: CanonicalFileEntry): number {
  return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0
}

/**
 * 规范序列化 + 聚合 hash：数组套数组（不是对象）从根上避免 key 顺序歧义；调用方必须先排序
 * entries（本函数不隐式排序，两处调用点——单 skill 清单收尾、多 skill 聚合——各自负责排序，
 * 排序标准始终是 byRelativePath）。
 */
function aggregateHash(entries: readonly CanonicalFileEntry[]): string {
  const canonical = entries.map((e) => [e.relativePath, e.sha256, e.executable] as const)
  return sha256Hex(JSON.stringify(canonical))
}

/** 路径安全闸：skill id 会直接拼进 CAS/临时目录路径段，禁绝任何路径逃逸/分隔符字符（判据见 types.ts）。 */
function assertSafeSkillId(skillId: SkillId): void {
  if (!isPathSafeSkillId(skillId)) {
    throw new SkillContentInvalidError(`skill id 含路径不安全字符，拒绝物化：${JSON.stringify(skillId)}`)
  }
}

export interface WalkHooks {
  /** 每发现一个（已解引用的）常规文件即回调一次；用于把内容顺带写进快照目的地（复制态遍历）。 */
  readonly onFile?: (relativePath: string, content: Buffer, executable: boolean) => Promise<void>
  /**
   * 测试专用注入点：判定某个 dirent 为"应读取的普通文件"（含内部 symlink 解引用后的文件目标）
   * 之后、真正 open/读取之前触发一次（收 relativePath + 该文件此刻的绝对路径）。用于确定性
   * 模拟"文件在类型判定与实际读取之间被替换为 symlink"的 TOCTOU 竞态——H10 r1 复审阻断2/4
   * 第3点。本 hook 不 mock 任何 fs 调用，只是给真实、确定性的时序打一个钩子（同
   * `materializeSkillSnapshot` 的 `onAfterBeforeDigest` 同一设计原则，见该字段头注）。生产
   * 装配从不传本字段；省略时行为等价于"从不触发"。
   */
  readonly onBeforeReadFile?: (relativePath: string, absPath: string) => Promise<void>
}

interface DirectoryIdentity {
  readonly absPath: string
  readonly dev: number
  readonly ino: number
}

async function assertDirectoryIdentities(
  identities: readonly DirectoryIdentity[],
  onFailure: (message: string) => Error,
): Promise<void> {
  for (const expected of identities) {
    let current
    try {
      current = await lstat(expected.absPath)
    } catch (e) {
      throw onFailure(`祖先目录不可访问：${expected.absPath}（${(e as Error).message}）`)
    }
    if (!current.isDirectory() || current.isSymbolicLink()) {
      throw onFailure(`祖先路径已不再是可信普通目录：${expected.absPath}`)
    }
    if (current.dev !== expected.dev || current.ino !== expected.ino) {
      throw onFailure(`祖先目录 inode 已变化（TOCTOU，拒绝继续读取）：${expected.absPath}`)
    }
  }
}

/** 拍下 canonical 根到文件父目录的逐级身份；根本身必须仍是 build 开始时看到的同一目录。 */
async function captureDirectoryIdentities(
  realRoot: string,
  absFile: string,
  rootIdentity: DirectoryIdentity,
  onFailure: (message: string) => Error,
): Promise<readonly DirectoryIdentity[]> {
  const parent = dirname(absFile)
  const fromRoot = relative(realRoot, parent)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw onFailure(`文件父目录已逃逸内容根：${parent}`)
  }
  const paths = [realRoot]
  let cursor = realRoot
  if (fromRoot !== '') {
    for (const segment of fromRoot.split(sep)) {
      cursor = join(cursor, segment)
      paths.push(cursor)
    }
  }

  const identities: DirectoryIdentity[] = []
  for (const absPath of paths) {
    let current
    try {
      current = await lstat(absPath)
    } catch (e) {
      throw onFailure(`祖先目录不可访问：${absPath}（${(e as Error).message}）`)
    }
    if (!current.isDirectory() || current.isSymbolicLink()) {
      throw onFailure(`祖先路径不是可信普通目录：${absPath}`)
    }
    identities.push({ absPath, dev: current.dev, ino: current.ino })
  }
  if (identities[0]?.dev !== rootIdentity.dev || identities[0]?.ino !== rootIdentity.ino) {
    throw onFailure(`内容根 inode 已变化（TOCTOU，拒绝继续读取）：${realRoot}`)
  }
  return identities
}

/**
 * TOCTOU-safe 读取一个"此刻应为普通文件"的路径（H10 r1 复审阻断2/4 第3/4点）。
 *
 * `noFollow:true`（判定为普通文件的 dirent 分支、既有 CAS 目录逐字节校验都用这个）：open 时带
 * `O_NOFOLLOW`——若路径叶子节点此刻是 symlink（无论从一开始就是、还是在更早的类型判定之后才被
 * 替换成的），open 本身直接失败，绝无跟随的机会。
 *
 * `noFollow:false` + `expected`（内部 symlink 解引用分支专用）：这里"跟随"是设计内允许的语义
 * （内部 symlink 本就该解引用为内容），但仍要防"判定安全那一刻看到的目标"与"实际读到的目标"
 * 中途被换掉——open（跟随）之后立刻对同一个 fd 做 fstat，比对 dev/ino 与调用方在判定安全那一刻
 * （对 `absPath` 的 `stat` 结果）记录的是否一致，不一致即视为竞态替换、fail-loud。
 *
 * 两种模式共用同一条准则：**读到的必须是判定安全那一刻看到的同一个对象**，不是判定之后、读取
 * 之前，路径被重新指向的别的东西。open 成功后 fd 绑定到具体 inode，此后即便路径被替换也不影响
 * 已打开的 fd——读到的内容与 fstat 看到的类型/mode/dev/ino 必然对应同一个对象，不给"先判断后
 * 使用"的中间人替换窗口。
 */
async function readRegularFileStrict(
  absPath: string,
  onFailure: (message: string) => Error,
  opts: {
    readonly noFollow: boolean
    readonly expected?: { readonly dev: number; readonly ino: number }
    readonly ancestors?: readonly DirectoryIdentity[]
  },
): Promise<{ readonly content: Buffer; readonly mode: number }> {
  if (opts.ancestors) await assertDirectoryIdentities(opts.ancestors, onFailure)
  let handle: FileHandle
  try {
    handle = await open(absPath, opts.noFollow ? constants.O_RDONLY | constants.O_NOFOLLOW : constants.O_RDONLY)
  } catch (e) {
    throw onFailure(`打开失败（${(e as Error).message}）`)
  }
  try {
    const st = await handle.stat()
    if (!st.isFile()) {
      throw onFailure('open 后 fstat 复核：目标此刻已不是普通文件（symlink TOCTOU，拒绝跟随）')
    }
    if (opts.expected && (st.dev !== opts.expected.dev || st.ino !== opts.expected.ino)) {
      throw onFailure('open 后 fstat 复核：inode 与判定安全那一刻观察到的不一致（TOCTOU，目标已被替换）')
    }
    if (opts.ancestors) await assertDirectoryIdentities(opts.ancestors, onFailure)
    const content = await handle.readFile()
    if (opts.ancestors) await assertDirectoryIdentities(opts.ancestors, onFailure)
    return { content, mode: st.mode }
  } finally {
    await handle.close()
  }
}

/**
 * 规范化清单构建：递归遍历 sourceDir，产出排序后的文件条目 + 该 skill 自身聚合 hash。
 *
 * 拒绝目录逃逸 symlink（真实目标解析到 sourceDir 之外）、symlink 环、设备文件/socket/FIFO、
 * 不可读文件；内部 symlink 解引用为普通内容——文件目标记成常规文件条目，目录目标当目录递归
 * （真实路径去重防环）。
 */
export async function buildCanonicalManifest(
  skillId: SkillId,
  sourceDir: string,
  hooks: WalkHooks = {},
): Promise<SkillCanonicalManifest> {
  assertSafeSkillId(skillId)

  let realRoot: string
  try {
    realRoot = await realpath(sourceDir)
  } catch (e) {
    throw new SkillContentInvalidError(`skill '${skillId}' 内容根不可解析：${sourceDir}（${(e as Error).message}）`)
  }
  const rootStat = await stat(realRoot).catch((e: unknown) => {
    throw new SkillContentInvalidError(`skill '${skillId}' 内容根不可访问：${realRoot}（${(e as Error).message}）`)
  })
  if (!rootStat.isDirectory()) {
    throw new SkillContentInvalidError(`skill '${skillId}' 内容根不是目录：${realRoot}`)
  }
  const rootIdentity: DirectoryIdentity = { absPath: realRoot, dev: rootStat.dev, ino: rootStat.ino }

  const entries: CanonicalFileEntry[] = []
  let skillDocContent: Buffer | undefined
  const visitedDirs = new Set<string>([realRoot])

  // TOCTOU-safe 读取（H10 r1 复审阻断2/4 第3点）：`toctou` 描述"判定安全那一刻"记录的模式——
  // 普通文件分支传 `{ noFollow: true }`（open 本身拒绝跟随任何 symlink 叶子）；内部 symlink
  // 解引用分支传 `{ noFollow: false, expected }`（跟随是设计内语义，但 open 后必须 fstat 复核
  // dev/ino 与判定安全那一刻一致）。onBeforeReadFile 钩子在真正 open 之前触发，供测试确定性
  // 模拟"判定之后、读取之前被替换"的竞态。
  const readAndRecord = async (
    absPath: string,
    relPath: string,
    toctou: { readonly noFollow: boolean; readonly expected?: { readonly dev: number; readonly ino: number } },
  ): Promise<void> => {
    const onFailure = (msg: string): SkillContentInvalidError =>
      new SkillContentInvalidError(`skill '${skillId}' 的文件读取被拒绝：${relPath}（${msg}）`)
    const ancestors = await captureDirectoryIdentities(realRoot, absPath, rootIdentity, onFailure)
    if (hooks.onBeforeReadFile) await hooks.onBeforeReadFile(relPath, absPath)
    const { content, mode } = await readRegularFileStrict(
      absPath,
      onFailure,
      { ...toctou, ancestors },
    )
    const executable = (mode & EXEC_BITS) !== 0
    if (relPath === 'SKILL.md') skillDocContent = Buffer.from(content)
    entries.push({ relativePath: relPath, sha256: sha256Hex(content), executable })
    if (hooks.onFile) await hooks.onFile(relPath, content, executable)
  }

  const visit = async (realDir: string, relDir: string): Promise<void> => {
    let dirents
    try {
      dirents = await readdir(realDir, { withFileTypes: true })
    } catch (e) {
      throw new SkillContentInvalidError(`skill '${skillId}' 目录不可读：${relDir || '.'}（${(e as Error).message}）`)
    }

    for (const d of dirents) {
      const relPath = relDir ? `${relDir}/${d.name}` : d.name
      const absPath = join(realDir, d.name)

      if (d.isSymbolicLink()) {
        let real: string
        try {
          real = await realpath(absPath)
        } catch (e) {
          throw new SkillContentInvalidError(`skill '${skillId}' 含悬空 symlink：${relPath}（${(e as Error).message}）`)
        }
        const fromRoot = relative(realRoot, real)
        if (fromRoot === '..' || fromRoot.startsWith(`..${'/'}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' 含目录逃逸 symlink：${relPath} → ${real}`)
        }
        const targetStat = await stat(real) // 只认 containment 已确认的真实路径，不再二次跟随可变 symlink
        if (targetStat.isDirectory()) {
          if (visitedDirs.has(real)) {
            throw new SkillContentInvalidError(`skill '${skillId}' 含 symlink 环：${relPath} → ${real}`)
          }
          visitedDirs.add(real)
          await visit(real, relPath)
        } else if (targetStat.isFile()) {
          // 内部 symlink 解引用为内容是设计内语义（跟随），但 open 后必须 fstat 复核 dev/ino
          // 与这里记录的一致——防"判定安全那一刻的目标"与"实际读到的目标"之间被重新指向别处
          // （H10 r1 复审阻断2/4 第3点）。
          await readAndRecord(real, relPath, { noFollow: true, expected: { dev: targetStat.dev, ino: targetStat.ino } })
        } else {
          throw new SkillContentInvalidError(`skill '${skillId}' 的 symlink 目标既非文件也非目录：${relPath}`)
        }
        continue
      }

      if (d.isDirectory()) {
        const real = await realpath(absPath)
        const fromRoot = relative(realRoot, real)
        if (fromRoot === '..' || fromRoot.startsWith(`..${'/'}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' 目录在遍历期间逃逸：${relPath} → ${real}`)
        }
        if (visitedDirs.has(real)) continue
        visitedDirs.add(real)
        await visit(real, relPath)
        continue
      }

      if (d.isFile()) {
        // 普通文件分支：open 时带 O_NOFOLLOW——若此刻（readdir 判定之后）已被替换成 symlink，
        // open 直接失败，绝不跟随（H10 r1 复审阻断2/4 第3点，取代原先"先 lstat 取 mode、再另开
        // 一次 readFile"之间的 TOCTOU 窗口）。
        const real = await realpath(absPath)
        const fromRoot = relative(realRoot, real)
        if (fromRoot === '..' || fromRoot.startsWith(`..${'/'}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' 文件在读取前逃逸：${relPath} → ${real}`)
        }
        const expected = await stat(real)
        await readAndRecord(real, relPath, { noFollow: true, expected: { dev: expected.dev, ino: expected.ino } })
        continue
      }

      // 设备文件 / socket / FIFO 等特殊文件类型——一律拒绝，不静默跳过。
      throw new SkillContentInvalidError(`skill '${skillId}' 含不支持的文件类型：${relPath}`)
    }
  }

  await visit(realRoot, '')
  entries.sort(byRelativePath)

  // H10 r1 复审阻断2/4 第5点：SKILL.md 存在且非空是 skill 树的有效性门槛——防止把任意目录
  // （包括恰好没有入口文档的半成品目录）当作合法 skill 物化、或喂给 content-locator 的多根
  // 折叠判定当"这是一个真 skill"处理。
  const skillDoc = entries.find((e) => e.relativePath === 'SKILL.md')
  if (!skillDoc) {
    throw new SkillContentInvalidError(`skill '${skillId}' 内容根缺少 SKILL.md：${realRoot}`)
  }
  if (skillDoc.sha256 === EMPTY_FILE_SHA256 || skillDocContent === undefined) {
    throw new SkillContentInvalidError(`skill '${skillId}' 的 SKILL.md 为空文件：${realRoot}`)
  }
  let skillDocText: string
  try {
    skillDocText = new TextDecoder('utf-8', { fatal: true }).decode(skillDocContent)
  } catch {
    throw new SkillContentInvalidError(`skill '${skillId}' 的 SKILL.md 不是合法 UTF-8：${realRoot}`)
  }
  if (skillDocText.trim().length === 0 || skillDocText.includes('\0')) {
    throw new SkillContentInvalidError(`skill '${skillId}' 的 SKILL.md 为空白或含 NUL：${realRoot}`)
  }

  return { skillId, files: entries, treeSha256: aggregateHash(entries) }
}

/** 复制一个已发现的文件到快照目的地：按相对路径重建目录、写内容、按 executable 置 0755/0644。 */
async function copyFileInto(destRoot: string, relativePath: string, content: Buffer, executable: boolean): Promise<void> {
  const dest = join(destRoot, relativePath)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, content)
  await chmod(dest, executable ? 0o755 : 0o644)
}

const MAX_COPY_ATTEMPTS = 2

/**
 * 单个 skill 的"双遍 source digest"稳定性检查 + 复制（设计 §3 步骤 3）：每次尝试先纯只读扫一遍
 * source 拿 before 摘要，再扫一遍 source 同时把内容写进 destDir 拿 after 摘要；两遍一致才算稳定、
 * 采信这次复制结果。复制期间源变化 → 本次尝试作废、重试一次；重试仍不稳定 → fail-loud。
 */
async function materializeOneSkillWithStabilityCheck(
  skillId: SkillId,
  sourceDir: string,
  destDir: string,
  onAfterBeforeDigest?: (skillId: SkillId, attempt: number) => Promise<void> | void,
): Promise<SkillCanonicalManifest> {
  let lastBefore = ''
  let lastAfter = ''
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
    const before = await buildCanonicalManifest(skillId, sourceDir)
    if (onAfterBeforeDigest) await onAfterBeforeDigest(skillId, attempt)

    await rm(destDir, { recursive: true, force: true })
    await mkdir(destDir, { recursive: true })
    const after = await buildCanonicalManifest(skillId, sourceDir, {
      onFile: (relPath, content, executable) => copyFileInto(destDir, relPath, content, executable),
    })

    if (before.treeSha256 === after.treeSha256) return after
    lastBefore = before.treeSha256
    lastAfter = after.treeSha256
  }
  throw new SkillSnapshotSourceUnstableError(
    `skill '${skillId}' 源内容在快照复制期间连续 ${MAX_COPY_ATTEMPTS} 次不稳定` +
      `（最后一次 before=${lastBefore} after=${lastAfter}）`,
  )
}

function skillSnapshotCasRoot(projectRoot: string): string {
  return join(projectRoot, '.pipeline', 'loops', 'skill-snapshots')
}

/**
 * 递归列出 dir 下所有条目（相对路径，已排序），并用 `lstat`（不跟随 symlink）逐条校验类型：
 * 只允许目录与普通文件——碰到 symlink/设备文件/socket/FIFO 等任何非目录非普通文件条目，一律
 * 判 CAS 损坏，不当"可读文件"跟随 symlink 消费（H10 r1 复审阻断2/4 第4点：既有 CAS 内容形状
 * 必须恰好是本模块自己会产出的那种"纯目录+纯普通文件"树——不论 dir 是刚构建的 stagingDir
 * 还是磁盘上已发布的既有目录，一视同仁，不因为"这是我们自己产出的目录"就假定安全）。
 */
async function listRegularFilesRecursiveOrThrow(dir: string, digest: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (rel: string): Promise<void> => {
    const abs = join(dir, rel)
    let dirents
    try {
      dirents = await readdir(abs, { withFileTypes: true })
    } catch (e) {
      throw new SkillSnapshotIoError(`CAS 目录读取失败（digest ${digest}）：${(e as Error).message}`)
    }
    for (const d of dirents) {
      const childRel = rel ? `${rel}/${d.name}` : d.name
      const childAbs = join(abs, d.name)
      let lst
      try {
        lst = await lstat(childAbs)
      } catch (e) {
        throw new SkillSnapshotIoError(`CAS 目录条目读取失败（digest ${digest}，路径 ${childRel}）：${(e as Error).message}`)
      }
      if (lst.isDirectory()) {
        await walk(childRel)
      } else if (lst.isFile()) {
        out.push(childRel)
      } else {
        throw new SkillSnapshotCorruptError(
          `CAS 目录（digest ${digest}）内 '${childRel}' 不是普通文件或目录（可能是 symlink/设备文件/socket），拒绝当内容消费`,
        )
      }
    }
  }
  await walk('')
  out.sort()
  return out
}

/**
 * 既有同 digest CAS 目录的逐字节验证（设计 §3 步骤 6："已存在同 hash 的目录必须逐字节验证，
 * 绝不覆盖"）：比对文件集合是否一致、逐文件字节内容是否一致、可执行位是否一致。任一不一致
 * → SkillSnapshotCorruptError，调用方绝不能覆盖既有目录。两侧读取都走 TOCTOU-safe 的
 * `readRegularFileStrict`（`noFollow:true`）——既有目录里任何非目录条目一律不得用会跟随
 * symlink 的方式当普通文件消费（H10 r1 复审阻断2/4 第4点）。
 */
async function verifyByteIdenticalOrThrow(freshDir: string, existingDir: string, digest: string): Promise<void> {
  const [freshFiles, existingFiles] = await Promise.all([
    listRegularFilesRecursiveOrThrow(freshDir, digest),
    listRegularFilesRecursiveOrThrow(existingDir, digest),
  ])

  const sameSet = freshFiles.length === existingFiles.length && freshFiles.every((f, i) => f === existingFiles[i])
  if (!sameSet) {
    throw new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）文件集合与新快照不一致，拒绝复用`)
  }

  for (const rel of freshFiles) {
    const fresh = await readRegularFileStrict(
      join(freshDir, rel),
      (msg) => new SkillSnapshotIoError(`新快照校验读取失败（digest ${digest}，路径 ${rel}）：${msg}`),
      { noFollow: true },
    )
    const existing = await readRegularFileStrict(
      join(existingDir, rel),
      (msg) => new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）在 '${rel}' 处不是可信的普通文件：${msg}`),
      { noFollow: true },
    )
    if (!fresh.content.equals(existing.content)) {
      throw new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）在 '${rel}' 处内容与新快照不一致，拒绝复用`)
    }
    const freshExec = (fresh.mode & EXEC_BITS) !== 0
    const existingExec = (existing.mode & EXEC_BITS) !== 0
    if (freshExec !== existingExec) {
      throw new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）在 '${rel}' 处可执行位与新快照不一致，拒绝复用`)
    }
  }
}

async function assertCommittedSnapshotOrThrow(existingDir: string, digest: string): Promise<void> {
  const marker = await readRegularFileStrict(
    join(existingDir, SKILL_SNAPSHOT_COMMIT_MARKER),
    (msg) => new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）缺少可信 commit marker：${msg}`),
    { noFollow: true },
  )
  if (!marker.content.equals(Buffer.from(`${digest}\n`, 'utf8'))) {
    throw new SkillSnapshotCorruptError(`既有 CAS 目录（digest ${digest}）commit marker 内容不匹配，拒绝复用`)
  }
}

/**
 * 最终目录已由本 publisher 用独占 mkdir 认领；逐文件 `wx` 写入且 marker 最后提交，绝不使用
 * 会替换来源不明空目录的 rename。任何中途失败都留下“无 marker 的未提交目录”，后续 fail-closed。
 */
async function publishSnapshotWithoutRename(stagingDir: string, finalDir: string, digest: string): Promise<void> {
  const files = await listRegularFilesRecursiveOrThrow(stagingDir, digest)
  if (!files.includes(SKILL_SNAPSHOT_COMMIT_MARKER)) {
    throw new SkillSnapshotIoError(`新快照缺少 commit marker（digest ${digest}）`)
  }

  for (const rel of files) {
    if (rel === SKILL_SNAPSHOT_COMMIT_MARKER) continue
    const source = await readRegularFileStrict(
      join(stagingDir, rel),
      (msg) => new SkillSnapshotIoError(`新快照发布读取失败（digest ${digest}，路径 ${rel}）：${msg}`),
      { noFollow: true },
    )
    const dest = join(finalDir, rel)
    try {
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, source.content, { flag: 'wx', mode: (source.mode & EXEC_BITS) !== 0 ? 0o755 : 0o644 })
    } catch (e) {
      throw new SkillSnapshotIoError(`新快照独占发布失败（digest ${digest}，路径 ${rel}）：${(e as Error).message}`)
    }
  }

  try {
    await writeFile(join(finalDir, SKILL_SNAPSHOT_COMMIT_MARKER), `${digest}\n`, { flag: 'wx', mode: 0o644 })
  } catch (e) {
    throw new SkillSnapshotIoError(`新快照 commit marker 写入失败（digest ${digest}）：${(e as Error).message}`)
  }
  await verifyByteIdenticalOrThrow(stagingDir, finalDir, digest)
}

async function withDigestPublishLock<T>(casRoot: string, digest: string, publish: () => Promise<T>): Promise<T> {
  const lockRoot = join(casRoot, '.publish-locks')
  const lockDir = join(lockRoot, `${digest}.lock`)
  try {
    await mkdir(lockRoot, { recursive: true })
  } catch (e) {
    throw new SkillSnapshotIoError(`CAS 发布锁根目录创建失败（digest ${digest}）：${(e as Error).message}`)
  }

  const deadline = Date.now() + PUBLISH_LOCK_TIMEOUT_MS
  while (true) {
    try {
      await mkdir(lockDir)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new SkillSnapshotIoError(`CAS 发布锁获取失败（digest ${digest}）：${(e as Error).message}`)
      }
      if (Date.now() >= deadline) {
        throw new SkillSnapshotIoError(`CAS 发布锁等待超时（digest ${digest}），拒绝读取可能未提交的目标目录`)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, PUBLISH_LOCK_RETRY_MS))
    }
  }

  try {
    return await publish()
  } finally {
    // 仅用 rmdir 删除空锁目录；若被塞入未知内容会失败并保留，绝不递归删除锁路径下的数据。
    await rmdir(lockDir).catch(() => {})
  }
}

export interface MaterializeSkillSnapshotOptions {
  readonly projectRoot: string
  /**
   * 测试专用注入点：某个 skill 的"复制前摘要"拍完、真正开始复制前触发一次（收 skillId + 第几次
   * 尝试，attempt 从 1 起）。用于确定性模拟"复制期间源内容变化"（设计 §7 否决"纯 mock 文件系统
   * 测试"——本 hook 不 mock 任何 fs 调用，只是给真实、确定性的时序打一个钩子，被回调的副作用
   * 依然是真实 fs 写入）。生产装配（H10 任务7）从不传本字段；省略时行为等价于"从不触发"。
   */
  readonly onAfterBeforeDigest?: (skillId: SkillId, attempt: number) => Promise<void> | void
  /**
   * H10 r1 复审阻断2/4 第2/4点：CAS canonical descriptor（manifest.json）的完整 provenance——
   * 由调用方传入（本模块不知道 loop/policy/workflow 是什么，不 import admission/kernel 的任何
   * 符号，见文件头注）。省略时描述符落盘不含 provenance 字段、聚合 digest 视同 provenance=null
   * （生产装配接线是 H10 任务B1；本模块只负责"给了就诚实落盘 + 纳入 digest 覆盖"）。字段规范见
   * types.ts::SkillSnapshotProvenance 头注。
   */
  readonly provenance?: SkillSnapshotProvenance
}

/**
 * 发布态聚合 digest 的规范序列化：数组套数组（不是对象），字段顺序由本函数写死、不透传调用方
 * 对象的 key 插入顺序——沿用 `aggregateHash` 同一条"从根上避免 key 顺序歧义"设计原则（见该
 * 函数注释）。覆盖 manifest.json 的**全部**声明内容——每文件条目、每 skill 小结、以及可选的
 * 完整 provenance：任一处被编辑都必然改变本函数输出、从而改变最终写入 manifest.json 的
 * `digest` 字段（H10 r1 复审阻断2/4 D4："CAS 内必须有被 digest 覆盖的完整 canonical
 * descriptor"）——这是堵死"改 manifest 保 digest"攻击的系统性方式：任何后续想要验证某个
 * 已发布 manifest.json 未被篡改的调用方，只需按同一条规则重算一遍并比对 `digest` 字段/CAS
 * 目录名即可，不需要重新对整棵文件树算一遍字节哈希。provenance 缺席时归一为 `null`，与"传入
 * 某个具体 provenance"在聚合口径上永不混淆（省略不等价于任何具体取值）。
 *
 * 已知取舍：provenance 若包含 `attempt_id`/`reservation_id` 等逐次执行才有的字段，同一份
 * skill 内容在不同 attempt 下会产出不同 digest、不同 CAS 目录——牺牲跨 attempt 的内容级去重，
 * 换取"manifest 任一字段被改都能被发现"的完整性保证；这是本次复审明确要求的方向（`digest`
 * 必须完整覆盖 provenance，见上），接线时如何取舍留给 H10 任务B1。
 */
export function computePublishDigest(
  combinedFiles: readonly { readonly relativePath: string; readonly sha256: string; readonly executable: boolean }[],
  skillsSummary: readonly { readonly skillId: SkillId; readonly treeSha256: string; readonly fileCount: number }[],
  provenance: SkillSnapshotProvenance | undefined,
): string {
  const canonical = [
    combinedFiles.map((f) => [f.relativePath, f.sha256, f.executable] as const),
    skillsSummary.map((s) => [s.skillId, s.treeSha256, s.fileCount] as const),
    canonicalizeProvenance(provenance),
  ]
  return sha256Hex(JSON.stringify(canonical))
}

/** provenance 的规范序列化——字段顺序写死在本函数里，不依赖调用方构造对象字面量时的 key 顺序。 */
function canonicalizeProvenance(p: SkillSnapshotProvenance | undefined): unknown {
  if (p === undefined) return null
  return [
    p.loop_id,
    p.policy_epoch,
    p.skill_bundle_id,
    p.attempt_id,
    p.reservation_id,
    p.workflow_run_id ?? null,
    p.workflow,
    p.step,
    p.track,
    p.coordinate_digest,
    p.resolution_source,
    p.slots.map((s) => [s.alternatives, s.concrete_skill_id, s.tree_sha256] as const),
  ]
}

/** 外部 provenance 只读一次成为普通副本；digest 与落盘共用它，禁止 getter/Proxy 两拍撕裂。 */
function snapshotProvenance(p: SkillSnapshotProvenance | undefined): SkillSnapshotProvenance | undefined {
  if (p === undefined) return undefined
  return {
    loop_id: p.loop_id, policy_epoch: p.policy_epoch, skill_bundle_id: p.skill_bundle_id,
    attempt_id: p.attempt_id, reservation_id: p.reservation_id, workflow_run_id: p.workflow_run_id,
    workflow: p.workflow, step: p.step, track: p.track, coordinate_digest: p.coordinate_digest,
    resolution_source: p.resolution_source,
    slots: p.slots.map((s) => ({
      alternatives: [...s.alternatives], concrete_skill_id: s.concrete_skill_id, tree_sha256: s.tree_sha256,
    })),
  }
}

/**
 * 把若干已定位的 skill 内容根物化成一个不可变、内容寻址的 CAS 快照（设计 §3 步骤 3-6）：
 * 每个 skill 各自做双遍稳定性检查+复制到 staging 目录 → 聚合全体文件（按 `<skillId>/<相对路径>`
 * 排序）+ skill 小结（按 skillId 排序，供 digest/落盘共用，不受调用方 inputs 顺序影响）+ 可选
 * provenance 一并算出聚合 digest（见 `computePublishDigest`）→ 写 manifest.json（复制完之后
 * 才写，避免自引用）→ 写 staging commit marker → 持 per-digest 发布锁，独占 `mkdir` 最终路径，
 * 逐文件 `wx` 写入且 marker 最后落地到
 * `<projectRoot>/.pipeline/loops/skill-snapshots/sha256/<digest>/`。
 *
 * CAS 语义：`inputs=[]`（有效 skill 集为空）是合法的"空快照"，产出确定性的 digest，不视为错误
 * ——是否"未接线"由更上层的 profile/字段校验判定，本函数不做那个判断。目标路径已有任何内容
 * （不论是完整快照还是一个意外遗留的空目录）时，独占 `mkdir` 必然失败（POSIX `EEXIST`），此时
 * 先要求 digest commit marker 完整，再转入逐字节验证：一致 → 复用（`reused:true`，不覆盖）；
 * marker 缺失或内容不一致 → `SkillSnapshotCorruptError`（既有目录原样保留，不删除、不修复，交给
 * 运维/H10 任务5 的失败处理）。新目录发布不用 `rename`，因此不存在静默替换来源不明空目录的路径。
 */
export async function materializeSkillSnapshot(
  inputs: readonly SkillSnapshotInput[],
  options: MaterializeSkillSnapshotOptions,
): Promise<SkillSnapshotPublishResult> {
  const casRoot = skillSnapshotCasRoot(options.projectRoot)
  const shaRoot = join(casRoot, 'sha256')
  const stagingRoot = join(casRoot, '.tmp')
  const stagingDir = join(stagingRoot, `publish-${randomUUID()}`)
  try {
    // mkdir recursive:true 会顺带建出 stagingRoot/casRoot 等所有缺失祖先——shaRoot 与
    // stagingDir 分属两个不同子树（sha256/ 和 .tmp/ 是兄弟），各自都要显式建。
    await mkdir(shaRoot, { recursive: true })
    await mkdir(stagingDir, { recursive: true })
  } catch (e) {
    throw new SkillSnapshotIoError(`CAS 暂存/根目录创建失败：${(e as Error).message}`)
  }

  try {
    const manifests: SkillCanonicalManifest[] = []
    for (const input of inputs) {
      const destDir = join(stagingDir, 'skills', input.skillId)
      manifests.push(
        await materializeOneSkillWithStabilityCheck(input.skillId, input.contentDir, destDir, options.onAfterBeforeDigest),
      )
    }

    const combined = manifests
      .flatMap((m) => m.files.map((f) => ({ relativePath: `${m.skillId}/${f.relativePath}`, sha256: f.sha256, executable: f.executable })))
      .sort(byRelativePath)
    // 按 skillId 排序供 digest/落盘共用——与 combined 的排序原则一致，让"聚合 digest 与
    // manifest.json 内容"不因调用方传入 inputs 的顺序不同而漂移。注意：返回给调用方的
    // `manifests`（下方 return）仍保持 inputs 原序不变——loop-admission.ts::prepare() 按位置
    // 把 `selected[i]` 与 `publish.manifests[i]` 对齐，本函数不能悄悄打乱这个顺序契约。
    const skillsSummary = manifests
      .map((m) => ({ skillId: m.skillId, treeSha256: m.treeSha256, fileCount: m.files.length }))
      .sort((a, b) => (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0))

    const provenance = snapshotProvenance(options.provenance)
    const digest = computePublishDigest(combined, skillsSummary, provenance)

    const manifestRecord = {
      schemaVersion: 1,
      digest,
      skills: skillsSummary,
      files: combined,
      ...(provenance !== undefined ? { provenance } : {}),
    }
    try {
      await writeFile(join(stagingDir, 'manifest.json'), `${JSON.stringify(manifestRecord, null, 2)}\n`, 'utf8')
      await writeFile(join(stagingDir, SKILL_SNAPSHOT_COMMIT_MARKER), `${digest}\n`, { flag: 'wx', mode: 0o644 })
    } catch (e) {
      throw new SkillSnapshotIoError(`快照 manifest.json/commit marker 写入失败：${(e as Error).message}`)
    }

    const finalDir = join(shaRoot, digest)
    return await withDigestPublishLock(casRoot, digest, async () => {
      try {
        // 独占认领最终路径；EEXIST 永远按“别人的目录”处理，绝不覆盖。
        await mkdir(finalDir)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
          let finalStat
          try {
            finalStat = await lstat(finalDir)
          } catch (e) {
            throw new SkillSnapshotCorruptError(`既有 CAS 目标不可核验（digest ${digest}）：${(e as Error).message}`)
          }
          if (!finalStat.isDirectory() || finalStat.isSymbolicLink()) {
            throw new SkillSnapshotCorruptError(`既有 CAS 目标不是可信普通目录（digest ${digest}），拒绝覆盖`)
          }
          await assertCommittedSnapshotOrThrow(finalDir, digest)
          await verifyByteIdenticalOrThrow(stagingDir, finalDir, digest)
          return { digest, casDir: finalDir, manifests, reused: true }
        }
        throw new SkillSnapshotIoError(`CAS 目标目录声明失败（digest ${digest}）：${(err as Error).message}`)
      }
      await publishSnapshotWithoutRename(stagingDir, finalDir, digest)
      return { digest, casDir: finalDir, manifests, reused: false }
    })
  } finally {
    // staging 永不 rename 到最终路径；成功或失败都清掉本次私有暂存目录。
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
  }
}
