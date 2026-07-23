/**
 * 独占创建、不允许覆盖的原子发布（W1 第二增量：`.pipeline.yaml` 的 init 独占创建 /
 * TransitionRecord 不可变落盘共用同一个模式）。
 *
 * 同目录随机命名临时文件以 `wx` 写全量内容 → `link()` 原子 no-replace 发布到 target →
 * best-effort `unlink` 临时文件。写入与发布共用同一个 try/finally，任一步失败都会尝试清理
 * 临时文件（不吞失败本身，只吞 unlink 清理动作自己的失败）。
 *
 * 与 store.ts 的 `atomicWriteFile`（rename 语义）刻意不同：rename 在 POSIX 上总是静默覆盖
 * 同名目标，用于"可覆盖的常规更新"；这里用 `link()`，目标已存在时原子失败（原生 EEXIST
 * 错误，不转译——调用方需要更具体的错误类型就自己包一层 catch 转换），用于"独占创建、绝不
 * 允许覆盖既有内容"的场景。这是这个模式的唯一实现：此前 `store.ts`::init() 与
 * `transition-record-store.ts`::write() 各自维护一份几乎相同的 tmp+link+unlink，其中一处
 * 的 try/finally 范围漏包了 writeFile 那一步而另一处没漏（W1 第二增量第 9 轮 codex review
 * 抓到），提炼成一个共享实现从根上消灭"两份拷贝各自漂移"的可能性。
 */
import { randomUUID } from 'node:crypto'
import { link, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function atomicLinkPublish(dir: string, tmpNamePrefix: string, target: string, content: string): Promise<void> {
  const tmp = join(dir, `${tmpNamePrefix}-${randomUUID()}`)
  try {
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' })
    await link(tmp, target)
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

/** 同目录完整临时文件 + rename 覆盖：用于可变 current pointer 与兼容 projection。 */
export async function atomicReplaceFile(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp-${randomUUID()}`
  try {
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' })
    await rename(tmp, target)
  } finally {
    await unlink(tmp).catch(() => {})
  }
}
