/**
 * 不可变 TransitionRecord 落盘（W1 第二增量：WorkflowRun 持久化提交接缝）。
 *
 * 每条记录一个文件：`<changeDir>/.pipeline-transitions/<sequence 零填充 6 位>-<recordId>.json`。
 * 零填充保证字典序 = 时间序（便于 `ls`/调试直接读顺序，不是正确性依赖——正确性靠链式回溯，
 * 不靠目录列举）。
 *
 * 写入用「临时文件 + link + unlink 临时文件」而不是 store.ts 的 tmp+rename：rename 在 POSIX
 * 上总是静默覆盖同名目标，无法表达"不可变"——同 sequence+id 两次写会悄悄改写第一次的内容
 * （W1 第二增量第三轮 codex review 抓到）。link 在目标已存在时原子失败（EEXIST），天然是
 * "仅当不存在才创建"的排他语义，且跟 rename 一样是同文件系统内的元数据操作、不会有半截文件
 * 可见（写入过程只对 tmp 文件可见，link 前 tmp 已完整落盘）。
 *
 * 临时文件名用 crypto.randomUUID（不是 pid+自增计数器）：早期实现用可复用的 pid+tmpSeq 组合，
 * 第五轮 codex review 抓到真实故障链——若 link 成功后 unlink 失败（tmp 与 canonical 已是同一
 * inode），进程重启复用同一 PID 且 tmpSeq 归零重合时，下一次 writeFile（默认截断）会经由
 * 别名 inode 直接清空一份已提交的 canonical 记录。tmp 写入本身也用 `wx`（不存在才创建）而非
 * 默认截断写——即便真的撞上残留的同名 tmp（概率上 UUID 重复不可行，这里是纵深防御而非补救
 * 已知漏洞），也会 fail-loud 而不是静默截断别人的文件。这一整套「tmp wx 写 + link 发布 +
 * best-effort unlink」的机制本身提炼进了共享原语 atomic-publish.ts::atomicLinkPublish
 * （第 9 轮 codex review：此前这里与 store.ts::init() 各自维护一份，这里的 try/finally 范围
 * 漏包了 writeFile 那一步而 store.ts 那份没漏，两处独立实现的必然代价——现在唯一实现，两个
 * 调用方共用）。
 *
 * record.id / record.sequence 落盘前做路径安全校验：两者最终都拼进文件路径，拒绝会逃出
 * `.pipeline-transitions/` 目录或破坏文件名格式的值（`..`、路径分隔符、非有限非负整数
 * sequence）——record.id 目前恒为本仓自己的 newId() 生成，不是用户输入，但这层校验不依赖
 * "调用方永远诚实"这个假设。
 *
 * 记录写入本身**不是**提交点——repository 先写记录（此时它是未被任何人引用的孤儿），再由
 * canonical revision 绑定其 id+digest，并把 `.pipeline-run/current.json` 原子 rename 指向新
 * 完整状态；current rename 才是真正的提交点，YAML 在其后只做兼容投影。
 * readChain 只走「head → previousRecordId」的可达链，从未被 head 指向过的记录永远不会出现在
 * 任何调用方看到的结果里——不需要额外的孤儿清理机制，不可达本身就是「未提交」的定义。
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TransitionRecord } from '../workflow/run-types.js'
import { atomicLinkPublish } from './atomic-publish.js'

export const TRANSITION_RECORDS_DIR = '.pipeline-transitions'

/** 同 sequence+id 的记录已存在，拒绝覆盖（记录不可变，不是调用方可修正的普通错误）。 */
export class RecordAlreadyExistsError extends Error {
  constructor(public readonly path: string) {
    super(`TransitionRecord 已存在，拒绝覆盖（记录不可变）: ${path}`)
  }
}

/** record.id/sequence 落盘前的路径安全校验失败（见文件头部注释）。 */
export class InvalidRecordIdentityError extends Error {}

export interface TransitionRecordStore {
  write(changeDir: string, record: TransitionRecord): Promise<void>
  read(changeDir: string, sequence: number, recordId: string): Promise<TransitionRecord | undefined>
  /** 从 (headSequence, headId) 沿 previousRecordId 单向链回溯至链首，返回按 sequence 升序排列
   * 的可达记录。expectedRunId 是调用方已经从权威 canonical state 的 runMetadata.runId
   * 读到手上的值——链上每个节点都跟它比对，不采信链首（同样是从磁盘读出、可能被篡改的数据）
   * 自己声称的 runId：否则只要整条链（含链首）彼此 runId 一致，即便它整体属于另一个 run，
   * 当前校验也发现不了任何问题。链在中途断裂——祖先文件缺失、记录内容不可信（id/sequence 跟
   * 请求不符、runId 跟 expectedRunId 不符、内容本身损坏即非法 identity 或坏 JSON）、
   * previousRecordId 成环、超过 headSequence 步的防御性步数上限——统一从断点截止，不抛错、
   * 不产出错误顺序或重复的结果（诊断读，不是提交路径的正确性依赖）。真正的文件系统故障
   * （EACCES 权限不足、EIO 磁盘 I/O 错误等，不属于上述"内容损坏"两类）不算"链在此断裂"，会
   * 原样抛出——那代表底层存储本身不可靠，静默截断会把一次真实的基础设施故障伪装成"这条链就是
   * 这么短"。 */
  readChain(changeDir: string, headSequence: number, headId: string, expectedRunId: string): Promise<TransitionRecord[]>
}

/** 仅允许出现在文件名里的安全字符：字母数字/连字符/下划线（record.id 目前是 UUID，天然满足）。 */
const SAFE_RECORD_ID_RE = /^[A-Za-z0-9_-]+$/

function assertValidIdentity(sequence: number, recordId: string): void {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new InvalidRecordIdentityError(`非法 sequence（必须是正整数）: ${sequence}`)
  }
  if (!SAFE_RECORD_ID_RE.test(recordId)) {
    throw new InvalidRecordIdentityError(`非法 recordId（只允许字母数字/连字符/下划线）: ${recordId}`)
  }
}

function recordPath(changeDir: string, sequence: number, recordId: string): string {
  assertValidIdentity(sequence, recordId)
  const seqPart = String(sequence).padStart(6, '0')
  return join(changeDir, TRANSITION_RECORDS_DIR, `${seqPart}-${recordId}.json`)
}

class FsTransitionRecordStore implements TransitionRecordStore {
  async write(changeDir: string, record: TransitionRecord): Promise<void> {
    const dir = join(changeDir, TRANSITION_RECORDS_DIR)
    await mkdir(dir, { recursive: true })
    const target = recordPath(changeDir, record.sequence, record.id)
    try {
      await atomicLinkPublish(dir, '.tmp', target, JSON.stringify(record))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new RecordAlreadyExistsError(target)
      }
      throw e
    }
  }

  async read(changeDir: string, sequence: number, recordId: string): Promise<TransitionRecord | undefined> {
    try {
      const raw = await readFile(recordPath(changeDir, sequence, recordId), 'utf8')
      return JSON.parse(raw) as TransitionRecord
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw e
    }
  }

  async readChain(
    changeDir: string, headSequence: number, headId: string, expectedRunId: string,
  ): Promise<TransitionRecord[]> {
    const chain: TransitionRecord[] = []
    const visited = new Set<string>()
    let sequence: number | undefined = headSequence
    let id: string | undefined = headId
    let steps = 0
    while (sequence !== undefined && id !== undefined) {
      // 防御性步数上限：健康链从 head 到链首最多 headSequence 步（sequence 每步严格 -1）。损坏
      // 记录可能让某个节点错误地声称 previousRecordId（比如本该是链首的 sequence=1 记录），
      // 导致下一步会算出 sequence=0 去读——在真正发起那次读取之前拦下，省掉一轮注定失败的磁盘
      // 访问（下面的 try/catch 对 InvalidRecordIdentityError 也有兜底，这里的提前 break 只是
      // 纵深防御，不是唯一防线）。
      if (steps >= headSequence) break
      steps++
      let record: TransitionRecord | undefined
      try {
        record = await this.read(changeDir, sequence, id)
      } catch (e) {
        // previousRecordId 被污染成非法值（比如 "../bad"）会让 read() 内部 recordPath() 的
        // 校验抛 InvalidRecordIdentityError；文件内容不是合法 JSON（磁盘损坏/手工写坏）会让
        // JSON.parse 抛 SyntaxError——这两种都是「这条记录内容本身损坏/不可信」，语义上等同于
        // 记录缺失，当作链在此断裂处理。除此之外的异常（EACCES 权限不足、EIO 磁盘 I/O 错误等
        // 真正的文件系统故障）必须原样重新抛出，不能吞掉——那代表底层存储本身不可靠，静默
        // 截断会把一次真实的基础设施故障伪装成"这条链就是这么短"。
        if (e instanceof InvalidRecordIdentityError || e instanceof SyntaxError) break
        throw e
      }
      if (!record) break
      // 文件名与内容不匹配（篡改/损坏）——这个节点不可信，等同于记录缺失。
      if (record.id !== id || record.sequence !== sequence) break
      // 权威 runId 来自调用方外部传入的 expectedRunId，不是链首自证——链首同样是从磁盘读出、
      // 可能被篡改的数据，若只验证链内部彼此一致，整条链被替换成另一个 run 的记录也不会被
      // 发现（见接口文档注释）。
      if (record.runId !== expectedRunId) break
      // previousRecordId 形成环——同一个 id 不应该被回溯到第二次。
      if (visited.has(record.id)) break
      visited.add(record.id)
      chain.unshift(record)
      id = record.previousRecordId
      sequence = id === undefined ? undefined : record.sequence - 1
    }
    return chain
  }
}

export function createTransitionRecordStore(): TransitionRecordStore {
  return new FsTransitionRecordStore()
}
