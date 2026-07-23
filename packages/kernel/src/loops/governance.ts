/**
 * loop registry governance（GOAL H · Stage B 返工 #3+#4）—— 串行化所有受支持的 `.pipeline/loops.yaml`
 * 写入 / admission 物化预占 / docker-start 许可 / merge 许可的**更高层协调锁** + 内容 hash epoch。
 *
 * 两个概念（codex 定稿，合并 #3#4 为同一套机制、不新增 YAML revision 字段/sidecar）：
 *   · registryEpoch —— loops.yaml 原始字节的 SHA-256（不依赖 mtime、不改 schema；status/binding
 *     依赖字段/budget/limits/prefix/runner 任一变化都改 epoch）。用于检测快照是否失效。
 *   · governance lock —— 串行化所有 registry 写、admission 物化/预占、docker 启动、merge。
 *
 * 固定锁序（铁律，见 loop-admission/scheduler/lifecycle）：
 *   governance → ledger（临界区内**禁**取 change lock）
 *   governance → change/CAS（临界区内**禁**取 ledger lock）
 *   禁同持 ledger + change。跨域先释放当前锁再进下一阶段，靠 durable ledger reservation +
 *   automation 状态承担阶段间崩溃恢复。
 *
 * 锁实现复用 state/lock.ts 的 mkdir 原子锁（跨进程 mkdir 抢占 + 陈锁回收 + 心跳），锁基目录
 * `<repoRoot>/.pipeline/loops/governance`（实际锁目录 `.../governance/.pipeline.lock`）——与 ledger 锁
 * `.pipeline/loops/.pipeline.lock` **不同目录、不同队列**，故 governance 可包住 ledger 而不自等死锁。
 * governance 锁不需要 ledger 那套 AsyncLocalStorage 可重入（本层不自嵌套：writer/permit/reserve 各自
 * 独立获取一次 governance 锁，绝不 governance→governance）。
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withLock } from '../state/lock.js'
import { loadRegistry, RegistryReadError } from './registry.js'
import type { LoopEntry, LoopRegistry } from './types.js'

/** loops.yaml 相对 repoRoot 的路径段。 */
const LOOPS_REL = ['.pipeline', 'loops.yaml'] as const
/** governance 锁基目录（withLock 会在其下建 `.pipeline.lock`；与 ledger 锁目录不同，故可嵌套 ledger）。 */
const GOVERNANCE_LOCK_BASE = ['.pipeline', 'loops', 'governance'] as const
/** 文件缺失时的 epoch 哨兵（与任何真实内容的 sha256 都不同 → absent↔present 变化可被检出）。 */
export const ABSENT_REGISTRY_EPOCH = 'absent'

export function loopsYamlPath(repoRoot: string): string {
  return join(repoRoot, ...LOOPS_REL)
}

function governanceLockBase(repoRoot: string): string {
  return join(repoRoot, ...GOVERNANCE_LOCK_BASE)
}

/**
 * registry 快照：原始文本 + 内容 hash epoch + 解析后的 registry（+ 解析/校验错误）。
 * registry===null 且 errors 空 = 文件缺失；registry===null 且 errors 非空 = 解析/schema 失败。
 */
export interface LoopRegistrySnapshot {
  readonly text: string
  readonly epoch: string
  readonly registry: LoopRegistry | null
  readonly errors: readonly string[]
}

/** loop 在快照 epoch 处不 active（permit 据此拒绝启动/merge——kill-switch 原子性）。 */
export class LoopNotActiveError extends Error {
  readonly _tag = 'LoopNotActiveError'
  readonly loopId: string
  constructor(loopId: string, message: string) { super(message); this.name = 'LoopNotActiveError'; this.loopId = loopId }
}

/**
 * H10 §1（复审阻断1修复）：start permit 阶段发现该 loop 的治理身份（policy_epoch 和/或
 * skill_bundle_id）与调用方传入的 prepared 快照不符——语义是「策略已变更」，与 LoopNotActiveError
 * 的「loop 被停用」是两类不同事实，不可混同处置：
 *
 *   prepareSkillBundle（automation/admission/loop-admission.ts::createExecutionPreparation）在
 *   governance→ledger 锁序下，把当时的 registryContentEpoch(registry) 与 loop.skill_bundle_id 冻结进
 *   ledger 的 skill-bundle-snapshot 事件与 PreparedExecutionContext（见 automation/admission/
 *   execution-context.ts 头注）。从那一刻到 docker create/start（本文件 withLoopStartPermit 持
 *   governance 锁的这一刻）之间是一段无锁窗口——registry 仍可能被外部改动（换 bundle，或任何影响
 *   registryContentEpoch 的字段）。不在这里重新比对，容器就会带着已经不对应此刻治理事实的旧快照
 *   悄悄启动（H10 复审 r1 阻断1 原话：「snapshot ledger 事件落下后、sandbox 创建前把 bundle A 改成 B
 *   且保持 active，会继续启动 A」）。
 *
 *   `_tag='LoopPolicyChangedError'` 与 `'LoopNotActiveError'` 是两个不同字符串——automation/
 *   lifecycle/lifecycle.ts::isLoopNotActive 只认后者，本错误因此不会被现有「loop 已停用→killSwitched
 *   no-op」分支吞掉，天然 fail-loud 向上传播（该调用点 `if (isLoopNotActive(...)) {...}; throw
 *   permitErr` 的既有兜底必然落进 throw 分支）。把本错误映射成精确的 `skill-bundle-policy-changed`
 *   reason/结算处置是下游任务的职责，本类只保证「可判别（_tag/loopId/changed）、可导出（kernel
 *   index 出口）」。
 */
export class LoopPolicyChangedError extends Error {
  readonly _tag = 'LoopPolicyChangedError'
  readonly loopId: string
  /** 与 prepared 不符的具体字段（诊断用，可能同时含两项）。 */
  readonly changed: readonly ('policy_epoch' | 'skill_bundle_id')[]
  constructor(loopId: string, changed: readonly ('policy_epoch' | 'skill_bundle_id')[], message: string) {
    super(message)
    this.name = 'LoopPolicyChangedError'
    this.loopId = loopId
    this.changed = changed
  }
}

/** merge permit 的 base ref expected-old-SHA CAS 失败（base 在 permit 外被推进 → 不 merge）。 */
export class BaseRefCasError extends Error {
  readonly _tag = 'BaseRefCasError'
  constructor(message: string) { super(message); this.name = 'BaseRefCasError' }
}

/** 获取 governance 锁并锁内串行执行 fn（跨进程 mkdir 抢占）。锁基目录不存在自动 mkdir -p。 */
export async function withRegistryGovernanceLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const base = resolve(governanceLockBase(repoRoot))
  await mkdir(base, { recursive: true }) // withLock 的 mkdir(lockDir) 不建父目录，先自建
  return withLock(base, fn)
}

/** 读 loops.yaml 一次 → {text, epoch=sha256(bytes), registry, errors}。ENOENT → 缺失快照；其余 IO 错 → throw RegistryReadError。 */
export async function readRegistrySnapshot(repoRoot: string): Promise<LoopRegistrySnapshot> {
  let text: string
  try {
    text = await readFile(loopsYamlPath(repoRoot), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { text: '', epoch: ABSENT_REGISTRY_EPOCH, registry: null, errors: [] } // 文件缺失（非故障）
    }
    throw new RegistryReadError(`loops.yaml 读失败（${(e as NodeJS.ErrnoException).code ?? 'IO'}）：${e instanceof Error ? e.message : String(e)}`)
  }
  const epoch = createHash('sha256').update(text, 'utf8').digest('hex')
  // 复用 loadRegistry 的窄解析 + schema 校验 + 派生默认；注入已读文本（不重复读盘、不复制规则）。
  const { data, errors } = loadRegistry(repoRoot, { readText: () => text })
  return { text, epoch, registry: data, errors }
}

/** 断言 loopId 在该快照 epoch 处存在且 active，否则 throw LoopNotActiveError（permit 用）；通过时
 * 返回匹配到的 LoopEntry（H10 §1：withLoopStartPermit 借它复用同一次查找做 skill_bundle_id 比对，
 * 不在同一把锁内对 registry 做第二次独立查找）。 */
export function assertActiveAtEpoch(snapshot: LoopRegistrySnapshot, loopId: string): LoopEntry {
  const loop = snapshot.registry?.loops.find((l) => l.id === loopId)
  if (loop === undefined) {
    throw new LoopNotActiveError(loopId, `loop「${loopId}」在 registry 快照（epoch ${snapshot.epoch.slice(0, 12)}）中不存在`)
  }
  if (loop.status !== 'active') {
    throw new LoopNotActiveError(loopId, `loop「${loopId}」status=${loop.status}（非 active，kill-switch）`)
  }
  return loop
}

/**
 * 原子写 loops.yaml（调用方须已持 governance 锁）：同目录临时文件 write + fsync → atomic rename →
 * 目录 fsync（rename 持久化）。崩溃点上重启后 registry 必是旧完整版本或新完整版本，绝不半文件。
 */
export async function writeRegistryTextAtomic(repoRoot: string, text: string): Promise<void> {
  const dir = join(repoRoot, '.pipeline')
  await mkdir(dir, { recursive: true })
  const finalPath = loopsYamlPath(repoRoot)
  const tmp = join(dir, `.loops.yaml.tmp.${process.pid}.${randomBytes(6).toString('hex')}`)
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(text, 'utf8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  await rename(tmp, finalPath) // rename 原子：读者要么看到旧完整文件、要么新完整文件
  try {
    const dfh = await open(dir, 'r') // 目录 fsync：让 rename 本身落盘（崩溃持久性）
    try { await dfh.sync() } finally { await dfh.close() }
  } catch {
    // 目录 fsync 部分平台不允许（EISDIR/EINVAL）——best-effort，rename 原子性已保证一致性。
  }
}

/** 受支持的 registry 写入结果（epoch CAS 失败 = 首读 epoch 与锁内重读不符，另一写方/人工先落）。 */
export type RegistryWriteResult = { readonly ok: true } | { readonly ok: false; readonly error: string }

/**
 * governance 锁内做 epoch-CAS 写（所有系统支持的 loops.yaml 写方共用）：锁内重读 epoch，与调用方
 * 首读 expectedEpoch 不符 → CAS 失败（不盲写覆盖他人改动）；一致 → produce(currentText) 生成新文本
 * （返回 error 则拒写），atomic 落盘。produce 可异步：需要把外部 execution-material 复验推进到
 * 提交点的写方可在 governance 锁内 await 复验；produce 内仍应做 schema 校验（坏文本绝不落盘）。
 */
export async function writeRegistryWithGovernance(
  repoRoot: string,
  expectedEpoch: string,
  produce: (
    currentText: string,
    current: LoopRegistrySnapshot,
  ) => { text: string | null; error: string | null } | Promise<{ text: string | null; error: string | null }>,
): Promise<RegistryWriteResult> {
  return withRegistryGovernanceLock(repoRoot, async (): Promise<RegistryWriteResult> => {
    const current = await readRegistrySnapshot(repoRoot)
    if (current.epoch !== expectedEpoch) {
      return { ok: false, error: `CAS 失败：loops.yaml 在此期间被并发修改（epoch ${expectedEpoch.slice(0, 12)} → ${current.epoch.slice(0, 12)}）` }
    }
    const { text, error } = await produce(current.text, current)
    if (error !== null || text === null) return { ok: false, error: error ?? '生成写回文本失败' }
    await writeRegistryTextAtomic(repoRoot, text)
    return { ok: true }
  })
}

/**
 * H10 §1（复审阻断1修复）：withLoopStartPermit 比对用的最小 prepared 快照——字段与 automation 包
 * admission/execution-context.ts::PreparedExecutionContext 的同名两字段结构同构（kernel 不依赖
 * automation 包，故不直接 import 该类型，只镜像其形状；调用方——automation/sdk/dockerRunChange.ts——
 * 把 `{ policy_epoch: context.policy_epoch, skill_bundle_id: context.skill_bundle_id }` 传入即天然
 * 满足本接口，无需显式转换）。`skill_bundle_id` 的 undefined/null 同视为 unwired，与
 * loopMaterialUnchanged 既有归一化一致。
 */
export interface PreparedPolicySnapshot {
  /** = registryContentEpoch(registry)，prepare 阶段冻结时刻的值（同源 loop-admission.ts 步骤7 复核）。 */
  readonly policy_epoch: string
  /** prepare 阶段冻结时刻该 loop 的 skill_bundle_id；undefined/null 同视为 unwired。 */
  readonly skill_bundle_id?: string | null
}

/** 同一治理锁内复核 prepare 时冻结的策略身份；start/merge 共用，避免两道闸语义漂移。 */
function assertPreparedPolicyUnchanged(
  snapshot: LoopRegistrySnapshot,
  loop: LoopEntry,
  prepared: PreparedPolicySnapshot,
  phase: '启动 sandbox' | 'merge',
): void {
  const changed: ('policy_epoch' | 'skill_bundle_id')[] = []
  if (registryContentEpoch(snapshot.registry) !== prepared.policy_epoch) changed.push('policy_epoch')
  if ((loop.skill_bundle_id ?? null) !== (prepared.skill_bundle_id ?? null)) changed.push('skill_bundle_id')
  if (changed.length > 0) {
    throw new LoopPolicyChangedError(
      loop.id, changed,
      `loop「${loop.id}」策略已变更（${changed.join('、')} 与 prepare 时冻结快照不符）：拒绝${phase}（policy TOCTOU 闸）`,
    )
  }
}

/**
 * docker 启动许可（Stage B 返工 #3）：governance 锁内现读 registry、验证 loop active → 执行 fn（fn 只覆盖
 * 真正创建/启动容器的调用，直到 docker create/start 成功返回）→ 释放锁。**容器运行期不持锁**。
 * loop 已 paused → assertActiveAtEpoch throw LoopNotActiveError（调用方据此跳过启动、落 kill-switch）。
 *
 * H10 §1（复审阻断1修复）：`prepared` 形参——admission/prepare 阶段冻结进 ledger 的 policy_epoch +
 * skill_bundle_id（见 PreparedPolicySnapshot 文档）。同一把锁内、active 检查通过后，额外现读
 * registryContentEpoch(registry) 与该 loop 此刻的 skill_bundle_id，任一与 prepared 不符 → throw
 * LoopPolicyChangedError（详见该类文档）——绝不静默沿用 prepare 阶段冻结的旧快照启动 sandbox。
 */
export async function withLoopStartPermit<T>(
  repoRoot: string,
  loopId: string,
  prepared: PreparedPolicySnapshot,
  fn: () => Promise<T>,
): Promise<T> {
  return withRegistryGovernanceLock(repoRoot, async () => {
    const snapshot = await readRegistrySnapshot(repoRoot)
    const loop = assertActiveAtEpoch(snapshot, loopId)
    assertPreparedPolicyUnchanged(snapshot, loop, prepared, '启动 sandbox')
    return fn()
  })
}

/**
 * merge 许可（Stage B 返工 #3 + G5）：governance 锁内现读 active，随后复核 prepare 时冻结的
 * policy_epoch/skill_bundle_id，再复核 base ref 仍为预期值（expected-old-SHA CAS）→ 执行
 * merge/推进 base ref（**持锁到 ref 更新完成**）→ 释放锁。任一策略字段变化、loop paused 或 base
 * 被外部推进都在物理 merge 前 fail-closed。
 */
export async function withLoopMergePermit<T>(
  repoRoot: string,
  loopId: string,
  prepared: PreparedPolicySnapshot,
  fn: () => Promise<T>,
  verifyBase?: () => Promise<boolean>,
): Promise<T> {
  return withRegistryGovernanceLock(repoRoot, async () => {
    const snapshot = await readRegistrySnapshot(repoRoot)
    const loop = assertActiveAtEpoch(snapshot, loopId)
    assertPreparedPolicyUnchanged(snapshot, loop, prepared, 'merge')
    if (verifyBase !== undefined && !(await verifyBase())) {
      throw new BaseRefCasError(`loop「${loopId}」merge 前 base ref 已被外部推进（expected-old-SHA CAS 失败），不 merge`)
    }
    return fn()
  })
}

/**
 * registry 解析内容的 epoch（sha256(JSON.stringify(registry))）——admission 临界区用：以「已解析的物化
 * 内容」为 epoch，天然覆盖 status/binding 依赖字段/budget/limits/prefix/runner 全部 admission 相关变化
 * （注释/空白纯格式改动不扰 admission，也不需 epoch churn）。registry 写方另用 readRegistrySnapshot 的
 * 原始字节 epoch 做严格 CAS；两者同处 governance 锁下互斥，epoch 只在各自域内比较。null → 'absent'。
 */
export function registryContentEpoch(registry: LoopRegistry | null): string {
  if (registry === null) return ABSENT_REGISTRY_EPOCH
  return createHash('sha256').update(JSON.stringify(registry), 'utf8').digest('hex')
}

/** loop 的物化关键字段是否未变（binding/预算判定所依赖；epoch 相等已蕴含，此为防御性复核）。
 * H10 §1：纳入 skill_bundle_id——否则 admission 之后单独换 bundle 不会让已发的 start permit 失效，
 * 消费方会带着旧 bundle 的物化快照继续跑（`undefined` 与显式 `null` 同视为 unwired，避免仅因
 * 构造方式不同——例如清单外尚未接线本字段的旧测试夹具——就误报"已变"）。 */
export function loopMaterialUnchanged(a: LoopEntry, b: LoopEntry): boolean {
  return a.status === b.status
    && a.runner === b.runner
    && a.change_prefix === b.change_prefix
    && (a.skill_bundle_id ?? null) === (b.skill_bundle_id ?? null)
    && a.budget.max_runs_per_day === b.budget.max_runs_per_day
    && a.budget.max_in_flight === b.budget.max_in_flight
    && a.budget.max_tokens_per_day === b.budget.max_tokens_per_day
    && a.budget.tokens_per_run === b.budget.tokens_per_run
    && a.budget.on_exceed === b.budget.on_exceed
}
