/**
 * transition 域 —— 看板写回端点 POST /api/change/<name>/transition 的转换执行。
 *
 * G1 单一 TransitionApplication 用例（2026-07-17）：CLI（cli/commands/transition.ts）与 server
 * 现在共调同一个 kernel 用例——@pipeline-lite/kernel 的 createTransitionApplication。default/
 * custom 双轨分流、前置校验、flow.transition/planStepTransition、副作用、
 * runRepository.transact() 原子提交、breadcrumb→history→review-marker 收尾，全部下沉进
 * kernel/workflow/transition-application.ts 单一实现（GOAL.md G1 验收目标：消灭 cli/server 两处
 * 复制真相源）。本文件不再自己编排这些步骤，职责收窄为四步 server 接线壳：
 *   1. change 名合法性校验（CHANGE_NAME_RE）+ canonical-or-legacy state 是否存在——kernel 用例的输入契约
 *      假定 change 已确认存在，这两项属于 transition 域之外的纯 HTTP 前置校验，留在本文件。
 *   2. 把 TransitionDeps 的 fs/git 原语（fileExists/gitHeadSha）绑成 TransitionContext。
 *   3. 构造 TransitionCommand（含已绑定 root 的 loadWorkflow 柯里化）并调用
 *      TransitionApplication.execute()。
 *   4. 把 TransitionApplicationResult 精确映射成 HTTP code + JSON body：warnings 里的
 *      projection-write-failed 转译成对应的 stderr WARN 行（best-effort，不影响已成功的
 *      200）；build-sha-missing 这一种 warning 刻意不接——CLI 会为它发一条用户可见 WARN，
 *      server 在改用共享用例之前就不暴露这个信号，这是已披露的既有行为差异，本轮迁移原样
 *      保留、不顺带扩大 HTTP 契约（kernel transition-application.ts 头部注释同一处停止线）。
 * runRepository.transact() 的锁范围覆盖 execute() 整个回调（含 commit + 收尾投影），闭 TOCTOU
 * 的保证不变，只是编排主体从本文件搬进了 kernel 单一实现。
 * 老仓 dashboard 写回 run_transition 是 subprocess 跑 guard+state.sh；lite 走 kernel 直调（真改盘）。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compileWorkflow,
  createTransitionApplication,
  HISTORY_FILE,
  loadRegistry,
  loadWorkflow,
  nodeLoopIoStrict,
  stateStorageExistsSync,
  transitionRecordToHistoryEntry,
  validateCanonicalRevisionHistory,
} from '@pipeline-lite/kernel'
import type {
  BreadcrumbWriter, FlowEngine, HistoryEntry, HistoryWriter, ReviewMarkerWriter, StateStore,
  TransitionApplicationResult, TransitionContext, TransitionRecordStore, WorkflowRunRepository,
} from '@pipeline-lite/kernel'

// 事件 → 转移边表：re-export kernel 单一真相源（server/index.ts 对外沿用同名）。
export { TRANSITION_EVENTS, eventEdge } from '@pipeline-lite/kernel'
export type { EventEdge } from '@pipeline-lite/kernel'

export interface TransitionDeps {
  store: StateStore
  /**
   * WorkflowRun 持久化提交接缝（W1 第二增量）：transition 收尾统一走 runRepo.transact，
   * 锁的持有范围覆盖整个 callback（含 commit + breadcrumb/history/marker 兼容投影），与
   * cli/commands/transition.ts 共用同一个 kernel 实现，堵死此前锁外副作用可能因并发交错
   * 产生的撕裂。
   */
  runRepo: WorkflowRunRepository
  flow: FlowEngine
  clock: () => string
  /** 相对项目根的文件存在谓词（事件前置校验用；缺省 = 降级跳过文件面，同 lite/GUARD-RULES §7.2）。 */
  fileExists?: (root: string, relPath: string) => boolean
  /** `git rev-parse HEAD`（build-complete 冻结 SHA + verify-pass barrier；缺省跳过 SHA 面）。 */
  gitHeadSha?: (cwd: string) => Promise<string>
  /**
   * .pipeline-history.jsonl 记账（G20 / v5-T1）：转换成功后追加一行，形状对齐 CLI 侧
   * cli/commands/transition.ts 的既有口径——kind='transition' + raw=触发它的 event 名
   * （「transition-kind 的 raw = event」不变式）。best-effort：写失败仅 WARN 走 stderr，
   * 绝不影响主写已成功的 200（同 server.ts POST /api/changes 的 kind=init 记账语义）。
   * guard/前置校验拒绝的转换在 withLock 内即抛错，天然零记账。缺省 = 不记账（测试可不注入）。
   */
  history?: HistoryWriter
  /**
   * default 轨收尾（G1 修复）：changeDir/.breadcrumb + 进 review 相位时 <root>/
   * .pipeline-pending-review，对齐 cli/commands/transition.ts 的既有收尾（此前 server 完全没有，
   * 是已核实的 P1 bug——dashboard 放行推进到 review 相位，人工复核门在 gate.sh 直接失效）。
   * best-effort：写失败仅 WARN，不影响主写已成功的 200。缺省 = 不写（测试可不注入）。
   */
  breadcrumb?: BreadcrumbWriter
  reviewMarker?: ReviewMarkerWriter
}

export interface TransitionOutcome {
  code: number
  body: Record<string, unknown>
}

const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 已核实的既有死代码（BACKLOG 记录在案，非本次改动引入）：函数体内从未 `throw new
 * NotFoundError(...)`——保留这个类与下面的 catch 分支只是保持原样，删除死代码不在这次
 * 迁移范围内，避免节外生枝。 */
class NotFoundError extends Error {}

/**
 * TransitionApplicationResult.kind → HTTP code + JSON body。逐字对齐改动前本文件里
 * PreconditionError/ConflictError/UnknownEventError（本地异常类）与 IllegalTransitionError
 * （kernel 导入、用于 instanceof 分类）四者共同撑起的分类映射——消息模板一个字都没变，只是
 * 判别式从「捕获到哪个异常类」换成了「读 result.kind」（分流判定现在发生在 kernel
 * createTransitionApplication 内部，这里只做纯映射）。
 */
function mapTransitionResult(name: string, event: string, result: TransitionApplicationResult): TransitionOutcome {
  switch (result.kind) {
    case 'applied': {
      // warnings 逐条转译成 stderr WARN 行（best-effort 收尾失败，不影响已经成功的 200）。
      // build-sha-missing 刻意不接：CLI 会为它发一条用户可见 WARN，server 从改用共享用例之前
      // 就不暴露这个信号——见文件头注释，这是保留的既有行为差异，不是本轮遗漏。
      for (const warning of result.warnings) {
        if (warning.kind === 'build-sha-missing') continue
        switch (warning.projection) {
          case 'state-yaml':
            process.stderr.write(`WARN: state YAML projection 写入失败（canonical 已提交）: ${errText(warning.cause)}\n`)
            break
          case 'breadcrumb':
            process.stderr.write(`WARN: breadcrumb 写入失败: ${errText(warning.cause)}\n`)
            break
          case 'history':
            process.stderr.write(`WARN: history 写入失败: ${errText(warning.cause)}\n`)
            break
          case 'review-marker':
            process.stderr.write(`WARN: review marker 写入失败: ${errText(warning.cause)}\n`)
            break
        }
      }
      return { code: 200, body: { ok: true, name, event, from: result.from, to: result.to } }
    }
    case 'unknown-event':
      return { code: 400, body: { ok: false, error: `未知 event: ${result.event}` } }
    case 'event-source-mismatch':
      return {
        code: 409,
        body: {
          ok: false,
          error: `event '${result.event}' 与当前 phase '${result.current}' 不匹配（期望来自 '${result.expected}'）`,
        },
      }
    case 'illegal-transition':
      return { code: 409, body: { ok: false, error: `illegal transition: ${result.from} -> ${result.to}` } }
    case 'precondition-violated':
      return { code: 409, body: { ok: false, error: result.lines[0], detail: result.lines } }
    case 'workflow-not-found':
      return {
        code: 409,
        body: {
          ok: false,
          error: `workflow '${result.workflowName}' 未找到（期望 .pipeline/workflows/${result.workflowName}.yaml）`,
        },
      }
    case 'step-not-in-graph':
      return { code: 409, body: { ok: false, error: `step '${result.stepId}' 不在 workflow '${result.workflowName}' 里` } }
    case 'event-unsupported':
      return {
        code: 409,
        body: {
          ok: false,
          error: `step '${result.stepId}' 不支持 event '${result.event}'；该 step 支持：${result.available.join(', ') || '(无)'}`,
        },
      }
    case 'step-guard-failed': {
      // server 原有 PreconditionError 的 {error: lines[0], detail: lines} 形状——注意跟 CLI 不
      // 一样：这句没有 "ERROR:" 前缀、没有结尾冒号（CLI 那份是独立的 stderr 文案套路，两边故意
      // 不同，不是需要对齐的疏漏）。
      const lines = [`step '${result.stepId}' guard 未通过`, ...result.failures]
      return { code: 409, body: { ok: false, error: lines[0], detail: lines } }
    }
    case 'document-evidence-failed': {
      const lines = [`OpenSpec 文档证据未通过（phase=${result.phase}）`, ...result.blockers]
      return { code: 409, body: { ok: false, error: lines[0], detail: lines, code: 'document-evidence-failed' } }
    }
    case 'constraint-denied':
      return { code: 409, body: { ok: false, error: `automation constraint denied transition: ${result.reason}` } }
  }
}

export async function performTransition(
  deps: TransitionDeps,
  root: string,
  name: string,
  event: string,
): Promise<TransitionOutcome> {
  if (!name || !CHANGE_NAME_RE.test(name) || name.includes('..')) {
    return { code: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const dir = join(root, 'openspec', 'changes', name)
  if (!stateStorageExistsSync(dir)) {
    return { code: 404, body: { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' } }
  }
  // kernel 单源注入面：把 server 的 (root,path)/(cwd) 签名绑成已锚定项目根的 TransitionContext。
  const ctx: TransitionContext = {
    fileExists: deps.fileExists ? (p: string): boolean => deps.fileExists!(root, p) : undefined,
    gitHeadSha: deps.gitHeadSha ? (): Promise<string> => deps.gitHeadSha!(root) : undefined,
  }
  const app = createTransitionApplication({
    runRepository: deps.runRepo,
    flow: deps.flow,
    clock: deps.clock,
    history: deps.history,
    breadcrumb: deps.breadcrumb,
    reviewMarker: deps.reviewMarker,
    resolveConstraintContext: async ({ policy }) => {
      const registry = loadRegistry(root, nodeLoopIoStrict)
      if (registry.data === null) throw new Error(`loops registry 无法校验：${registry.errors.join('；')}`)
      const loop = registry.data.loops.find((candidate) => candidate.id === policy.loop_id)
      return { active: loop?.status === 'active', humanGateSatisfied: true }
    },
  })
  try {
    const result = await app.execute({
      root,
      changeDir: dir,
      changeName: name,
      event,
      context: ctx,
      // loadWorkflow→compileWorkflow：TransitionApplication 收编译产物 WorkflowIR；编译错误
      // （= 基础设施错误）经 execute 抛出，落 performTransition 的 catch → 500（同既有非法 workflow 语义）。
      loadWorkflow: (wfName) => {
        const def = loadWorkflow(root, wfName)
        return def ? compileWorkflow(def) : null
      },
    })
    return mapTransitionResult(name, event, result)
  } catch (e) {
    if (e instanceof NotFoundError) return { code: 404, body: { ok: false, error: '找不到该 change' } }
    return { code: 500, body: { ok: false, error: errText(e) } }
  }
}

/**
 * 读 changeDir/.pipeline-history.jsonl → 按 ts 升序的 HistoryEntry 数组。宽容读仅限于「内容
 * 局部污染」：文件不存在（ENOENT）→ []；损坏行（非 JSON / 非对象 / 缺 ts）逐行跳过不抛错——
 * 调用方（readChangeHistory）面对历史文件的任何局部污染都应尽量交付可用部分。但文件级别的
 * 其它读取错误（权限不足、EISDIR、磁盘 I/O 等）必须原样抛出，不能被误判成「还没有历史」而
 * 静默降级成 []——那会在真正的故障发生时把调用方导向一条空的假时间线。legacy opaqueTail 里的
 * transitions_history 不合并读（决议登记 #10：老 change 时间线由前端显示「早期记录不可用」）。
 */
async function readJsonlHistory(changeDir: string): Promise<HistoryEntry[]> {
  let text: string
  try {
    text = await readFile(join(changeDir, HISTORY_FILE), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [] // 文件不存在（还没任何记账）→ 空时间线，不是错误
    throw e // 权限/EISDIR/磁盘 I/O 等其它错误 fail-loud，不能伪装成「没有历史」
  }
  const entries: HistoryEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { ts?: unknown }).ts === 'string') {
        entries.push(parsed as HistoryEntry)
      }
    } catch {
      /* 损坏行跳过（宽容读） */
    }
  }
  return entries
}

export interface ChangeHistoryDeps {
  store: StateStore
  recordStore: TransitionRecordStore
}

/**
 * GET /api/change/:name/history 数据源（G21 / v5-T1，供详情卡阶段时间线消费；W1 第二增量
 * 必须修 #2：canonical TransitionRecord 链此前只写不读，JSONL 事实上仍是 transition 审计
 * 真相源，不满足"JSONL 不再是真相源"这条停止线）。
 *
 * 合并策略（W1 第二增量收尾：从时间戳比较改成逐条来源标记——2026-07-16 codex 架构评估否决了
 * 「canonical 链首条记录 observedAt vs JSONL 条目 ts 字符串比较」的原方案：同秒冲突判定不出
 * 先后、时钟回拨会让"更晚"的遗留记录被误判成"链建立之后的重复"从而丢弃、head 文件缺失时
 * 链为空导致"最早时间戳"取不到值从而把所有遗留 transition 一并清空、以及晚于链建立才执行的
 * `pipeline import` 追加进 JSONL 的老 transitions_history——任何"前 N 条"或"早于时间 X"的
 * 边界判定在这些场景下都会判错。新方案完全不比较任何时间戳，也不维护任何全局计数/边界，只看
 * 每条 JSONL 记录自身是否带 transitionRecordId 标记）：
 *   - kind≠'transition' 的条目（set/init/tool/prompt/import）——JSONL 永远是它们的真相源，
 *     canonical 链不覆盖这些 kind，原样保留。
 *   - kind='transition' 且带 transitionRecordId 的条目——这是某条 canonical TransitionRecord
 *     的兼容投影（唯一构造点见 transitionRecordToHistoryEntry），视为已被链上记录取代，不计入
 *     结果（哪怕 JSONL 里这一行的内容被篡改也不影响结果——真相只有链，这行的存在只是标记）。
 *   - kind='transition' 但不带 transitionRecordId 的条目——legacy/import/非 canonical writer
 *     产生的 transition，不论 canonical 链是否存在、链上对应记录是否可达都原样保留。
 *   - change 完全没有 canonical 链（runMetadata 缺失或 transitionHead 未设置）→ 全部 JSONL
 *     transition 条目原样保留，兼容 fallback（老 change 现状不变）。
 *   - canonical 侧用 recordStore.readChain() 从 head 沿 previousRecordId 回溯；中途缺祖先文件
 *     时只返回从 head 起仍可达的后缀（不抛错），本函数不做额外补偿——结果自然是「遗留 JSONL +
 *     可达的 canonical 后缀」，断裂处的中间记录不会被 JSONL 静默补齐。
 */
export async function readChangeHistory(changeDir: string, deps: ChangeHistoryDeps): Promise<HistoryEntry[]> {
  const jsonlEntries = await readJsonlHistory(changeDir)
  const state = await deps.store.read(changeDir)
  const metadata = state.runMetadata
  if (!metadata?.transitionHead) {
    return sortByTs(jsonlEntries) // 无 canonical 链：JSONL 是唯一来源，行为与升级前逐字一致
  }
  const chain = await deps.recordStore.readChain(
    changeDir, metadata.transitionSequence, metadata.transitionHead, metadata.runId,
  )
  // readChain 先取得本次响应要使用的对象快照，再核完整 immutable revision/record digest 链；
  // 任一 post-cutover 祖先损坏都 fail-loud，绝不把带来源标记的 JSONL 当替身补回。
  await validateCanonicalRevisionHistory(changeDir)
  // chain 已是 sequence 升序（TransitionRecordStore.readChain 保证的因果顺序），不可再排序——
  // 下面用 mergeCanonicalAndLegacy 两指针合并，而不是拼接后整体 sortByTs，原因见该函数头注释。
  const canonicalEntries = chain.map(transitionRecordToHistoryEntry)
  const legacyOrNonTransition = jsonlEntries.filter(
    (e) => e.kind !== 'transition' || e.transitionRecordId === undefined,
  )
  return mergeCanonicalAndLegacy(canonicalEntries, sortByTs(legacyOrNonTransition))
}

function sortByTs(entries: HistoryEntry[]): HistoryEntry[] {
  // ISO-8601 字符串序 = 时间序；Array#sort 稳定，同 ts 记录保持相对顺序。
  return entries.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
}

/**
 * 两指针合并（mergesort 的合并步骤）：canonicalSorted（.pipeline-transitions/ 链回溯出的记录，
 * 调用方保证已是 sequence 升序）与 legacySorted（.pipeline-history.jsonl 里的遗留/非 transition
 * 条目，调用方保证已按 ts 升序）合并成一份展示顺序的结果。
 *
 * 为什么不能像旧实现那样把两个数组拼接后整体调用一次 sortByTs：canonical 链的顺序真相是
 * sequence——TransitionRecordStore.readChain() 沿 previousRecordId 回溯出的因果顺序，权威、
 * 不该被推翻。但 sequence 只隐含在数组顺序里，不体现在 ts 字段上；系统时钟一旦在两次真实转换
 * 之间发生过回拨，后一次转换（sequence 更大、因果上更晚）的 ts 反而可能比前一次更早。对拼接后
 * 的整个数组做一次全局字符串时间戳排序，会把这条 ts 异常的记录排到它前一条 canonical 记录前面
 * ——一次不可靠的时间戳比较就此打乱了本该权威、不可动摇的因果顺序。
 *
 * 两指针合并从不让 canonicalSorted 内部的两个元素互相比较——每一步只拿 legacySorted 当前指针
 * 与 canonicalSorted 当前指针比较，取 ts 较小（更早）的一个放进结果、对应指针前移；哪个序列先
 * 耗尽，另一个序列剩余的部分整批追加到结果末尾。因此无论 canonical 内部的 ts 是否因时钟异常而
 * 显得"顺序颠倒"，它们在结果里的相对顺序必然与传入的 canonicalSorted 顺序（即 sequence 顺序）
 * 一致，不会被打乱。这跟"整体排序一次"在绝大多数情况下产出相同结果，唯独在 canonical 内部因
 * 时钟异常导致 ts 顺序颠倒时行为不同（两指针合并正确，整体排序错误）。
 *
 * ts 相同（打平）时优先取 legacySorted 一侧：对齐旧实现里 legacy 段本来拼接在 canonical 段前面、
 * 稳定排序打平时 legacy 排前的既有观感——这不是正确性要求，只是不必要地改变现有行为。
 */
function mergeCanonicalAndLegacy(canonicalSorted: HistoryEntry[], legacySorted: HistoryEntry[]): HistoryEntry[] {
  const merged: HistoryEntry[] = []
  let i = 0 // canonicalSorted 指针
  let j = 0 // legacySorted 指针
  while (i < canonicalSorted.length && j < legacySorted.length) {
    if (legacySorted[j]!.ts <= canonicalSorted[i]!.ts) {
      merged.push(legacySorted[j]!)
      j++
    } else {
      merged.push(canonicalSorted[i]!)
      i++
    }
  }
  while (i < canonicalSorted.length) merged.push(canonicalSorted[i++]!) // canonical 剩余部分整批追加，相对顺序不变
  while (j < legacySorted.length) merged.push(legacySorted[j++]!)
  return merged
}
