import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CanonicalFileEntry, SkillCanonicalManifest, SkillId, SkillSnapshotInput, SkillSnapshotProvenance, SkillSnapshotPublishResult } from './types.js'
import {
  EXEC_BITS,
  PUBLISH_LOCK_RETRY_MS,
  PUBLISH_LOCK_TIMEOUT_MS,
  SKILL_SNAPSHOT_COMMIT_MARKER,
  SkillSnapshotCorruptError,
  SkillSnapshotIoError,
  SkillSnapshotSourceUnstableError,
  aggregateHash,
  buildCanonicalManifest,
  byRelativePath,
  copyFileInto,
  readRegularFileStrict,
  sha256Hex,
} from './snapshot-manifest.js'

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
