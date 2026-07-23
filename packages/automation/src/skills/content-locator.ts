/**
 * SkillContentLocator（H10-T4，设计定稿 §2/§3 步骤 3）——skill id → 当前内容目录的物理适配层。
 * 只做定位，不保存/不定义 bundle（哪些 skill 属于一个 profile 是 G2/H10 任务2 的职责）；
 * 也不承担安装来源职责（那是 `templates/skill-sources.yaml`）。
 *
 * 多根枚举 + 歧义判定（设计 §2）：`roots` 由调用方给定（生产装配——H10 任务7——决定具体走
 * 哪些根、按什么顺序；本函数对根的语义/来源一概不知，只机械枚举）。同一 id 在多个根都存在时：
 *   · 全部内容 hash 相同 → 可折叠，返回其中一个候选（不依赖隐含搜索顺序——已证明选哪个结果
 *     都一样）；
 *   · 出现分歧 → SkillContentSourceAmbiguousError（fail-loud，禁止按 root 顺序静默择一）。
 * 一个候选都没有 → SkillContentNotFoundError。
 *
 * 内容 hash 复用 snapshot-store 的 canonical 清单算法（buildCanonicalManifest）——避免"歧义
 * 判定"和"快照物化"分裂成两套可能互相漂移的哈希口径。
 *
 * 错误分类纪律（H10 r1 复审阻断4）：每个候选根只有 `lstat` 报真 ENOENT 才算「这个根没有该
 * skill」，允许 fail-soft 试下一根；EACCES/EIO 等访问错误、悬空或成环 symlink（跟随链接的
 * `stat`/`realpath` 失败）、以及「存在但不是目录」，一律 fail-loud 抛 `SkillContentAccessError`，
 * 绝不伪装成「未安装」静默跳过——那会把一个真实存在但损坏/不可访问的候选悄悄吞成"下一个候选"，
 * 掩盖真实故障。见 `SkillContentAccessError` 类注。
 */
import { lstat, realpath, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { buildCanonicalManifest, SkillContentInvalidError } from './snapshot-store.js'
import { isPathSafeSkillId, type LocatedSkillContent, type SkillId } from './types.js'

// 复用 snapshot-store 的 SkillContentInvalidError（同一失败语义："这个字符串不能安全当 skill
// 内容寻址标识"），不为 locator 另造一个语义重复的错误类；重新导出方便调用方只从本模块一处
// import 就能捕全 locate() 可能抛出的错误集合。
export { SkillContentInvalidError }

/** 给定的所有根目录里都定位不到该 skill id。对应设计 §5 表 `skill-bundle-skill-not-found`。 */
export class SkillContentNotFoundError extends Error {
  override readonly name = 'SkillContentNotFoundError'
  readonly _tag = 'SkillContentNotFoundError'
}

/** 同一 skill id 在多个根内容不一致（无法折叠），fail-loud 拒绝隐含择一。对应设计 §5 表 `skill-bundle-source-ambiguous`。 */
export class SkillContentSourceAmbiguousError extends Error {
  override readonly name = 'SkillContentSourceAmbiguousError'
  readonly _tag = 'SkillContentSourceAmbiguousError'
}

/**
 * 候选路径「确实存在」（`lstat` 命中该路径本身）但不能安全地当作该 skill 的内容目录：EACCES/EIO
 * 等访问错误、悬空或成环 symlink（跟随链接的 `stat`/`realpath` 失败）、或存在但不是目录。
 * H10 r1 复审阻断4：这些情况绝不能伪装成「这个根没有该 skill」静默跳过去试下一根。
 * 调用方 `loop-admission.ts::selectFirstLocatable` 只对 `SkillContentNotFoundError` 一种 `_tag`
 * 做「试下一个 alternative」的 fail-soft 处理；本错误类不在那张白名单里，会经
 * `skillErrorReason` 对未识别 `_tag` 返回 `undefined` 后被原样 `throw e` 冒出——不需要本文件
 * 之外的任何改动就能天然 fail-loud。
 */
export class SkillContentAccessError extends Error {
  override readonly name = 'SkillContentAccessError'
  readonly _tag = 'SkillContentAccessError'
}

export interface SkillContentLocator {
  /** 物理定位一个 skill id；找不到/歧义都 fail-loud（绝不静默回退到某个默认根）。 */
  locate(skillId: SkillId): Promise<LocatedSkillContent>
}

/** 从 catch 到的未知值里取 Node 系统错误的 `code`（非标准形状 → 'unknown'，不假设结构）。 */
function errnoCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : 'unknown'
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 真文件系统实现：每个根下 `<root>/<skillId>` 若存在且（穿过 symlink 后）是目录，就算一个候选
 * ——`npx skills add` 等安装器常把 skill 装成 symlink，故用 `stat`（跟随链接）判目录、`realpath`
 * 取真实位置，返回值绝不是可能悬空的链接路径本身。
 */
export function createFsSkillContentLocator(roots: readonly string[]): SkillContentLocator {
  return {
    async locate(skillId) {
      // skillId 会直接拼进 join(root, skillId) 做候选路径；必须先于任何文件系统访问校验形状，
      // 否则含 `/`、`..` 的畸形 id 能把候选路径解析到调用方给定的根目录之外（同一判据见
      // snapshot-store.ts 的 assertSafeSkillId，两处共用 types.ts::isPathSafeSkillId，不分裂标准）。
      if (!isPathSafeSkillId(skillId)) {
        throw new SkillContentInvalidError(`skill id 含路径不安全字符，拒绝定位：${JSON.stringify(skillId)}`)
      }

      const candidates: { root: string; dir: string }[] = []
      for (const root of roots) {
        const candidate = join(root, skillId)

        // 第一步只用 lstat（不跟随 symlink）判「这个路径上到底有没有条目」——这是唯一能把「真不
        // 存在」和「存在但目标悬空/成环」分开的手段：对悬空 symlink，跟随链接的 stat 同样报
        // ENOENT，用它做存在性判断会把两种截然不同的情况混为一谈。只有这一步的 ENOENT 才是
        // 「这个根没有该 skill」，允许 fail-soft 试下一个根；其余任何错误（EACCES/EIO/…）立即
        // fail-loud——候选路径本身就够不着，没有资格判断"有没有"，不能悄悄当成"没有"。
        try {
          await lstat(candidate)
        } catch (err) {
          if (errnoCode(err) === 'ENOENT') continue
          throw new SkillContentAccessError(
            `skill '${skillId}' 候选路径 '${candidate}' 无法访问（${errnoCode(err)}），拒绝当作未安装静默跳过：${errMessage(err)}`,
          )
        }

        // 到这里说明路径上确有条目（文件/目录/symlink）。跟随 symlink 解析——悬空/成环链接、
        // 目标端权限问题都在此暴露；既然 lstat 已确认"这里有东西"，这些失败必须 fail-loud。
        let st: Stats
        try {
          st = await stat(candidate)
        } catch (err) {
          throw new SkillContentAccessError(
            `skill '${skillId}' 候选路径 '${candidate}' 已存在但无法解引用（${errnoCode(err)}，疑似悬空/成环 symlink 或权限问题）：${errMessage(err)}`,
          )
        }
        if (!st.isDirectory()) {
          throw new SkillContentAccessError(
            `skill '${skillId}' 候选路径 '${candidate}' 存在但不是目录，拒绝当作未安装静默跳过`,
          )
        }

        try {
          candidates.push({ root, dir: await realpath(candidate) })
        } catch (err) {
          throw new SkillContentAccessError(
            `skill '${skillId}' 候选路径 '${candidate}' 目录已确认存在但 realpath 解析失败（${errnoCode(err)}）：${errMessage(err)}`,
          )
        }
      }

      if (candidates.length === 0) {
        throw new SkillContentNotFoundError(`skill '${skillId}' 在给定的 ${roots.length} 个根目录里都不存在`)
      }
      if (candidates.length === 1) {
        return { skillId, contentDir: candidates[0]!.dir }
      }

      // 多候选：内容 hash 全同才可折叠；一旦分歧，禁止依赖隐含搜索顺序静默择一。
      const manifests = await Promise.all(candidates.map((c) => buildCanonicalManifest(skillId, c.dir)))
      const first = manifests[0]!
      const allSame = manifests.every((m) => m.treeSha256 === first.treeSha256)
      if (!allSame) {
        throw new SkillContentSourceAmbiguousError(
          `skill '${skillId}' 在多个根目录内容不一致（来源歧义）：${candidates.map((c) => `${c.root} → ${c.dir}`).join('; ')}`,
        )
      }
      return { skillId, contentDir: candidates[0]!.dir }
    },
  }
}
