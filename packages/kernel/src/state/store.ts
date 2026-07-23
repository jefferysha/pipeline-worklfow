/**
 * StateStore —— G1 canonical revision/current 存储 + legacy `.pipeline.yaml` adapter。
 * 官方读写以 `.pipeline-run/current.json` 为真相；YAML 只在 current 从未出现时兼容读取，并在每次
 * canonical commit 后 best-effort 投影。互斥走 mkdir 原子锁，kernel 零第三方运行时依赖。
 */
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import {
  QuoteGateError,
  type FieldName,
  type InitOptions,
  type PipelineState,
  type RepairProjectionOptions,
  type StateMutationKind,
  type StateProjectionStatus,
  type StateStore,
  type StateWriteIntent,
  type StateWriteResult,
} from '../types.js'
import { withLock } from './lock.js'
import { emptyFields, parsePipeline, quoteGate, serializePipeline } from './parse.js'
import {
  projectionMetadataFor, publishInitialRunRevision, publishRunRevision,
  readCurrentRunRevision, readImmutableRunRevision,
  type RunRevision,
} from './run-revision-store.js'

export const STATE_FILE_NAME = '.pipeline.yaml'

export class StateProjectionDriftError extends Error {
  readonly _tag = 'StateProjectionDriftError'
}

export interface StateStoreOptions {
  /** 崩溃点/IO 故障注入；生产缺省仍是同目录 tmp+rename。 */
  readonly writeProjection?: (target: string, content: string) => Promise<void>
}

/** 对齐老内核 validate_change_name：非空、仅 [a-zA-Z0-9_-]、禁 ..（path traversal） */
const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/

/** 缺省时钟：ISO8601 UTC 秒级精度，对齐老内核 `date -u +%Y-%m-%dT%H:%M:%SZ` */
function defaultClock(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

function stateFilePath(changeDir: string): string {
  return path.join(changeDir, STATE_FILE_NAME)
}

function alreadyInitialized(pathname: string): NodeJS.ErrnoException {
  const error = new Error(`init: change 已存在，拒绝覆盖: ${pathname}`) as NodeJS.ErrnoException
  error.code = 'EEXIST'
  error.path = pathname
  return error
}

/** 同目录 tmp + rename，写入原子可见（对齐老内核 `> tmp && mv`）。导出为公开原语，但目前
 * 唯一真实消费方是本文件下方 `.pipeline.yaml` 自己的 write()——W1 第二增量的
 * transition-record-store.ts **没有**复用它：rename 在 POSIX 上总是静默覆盖同名目标，
 * 无法表达"不可变"（同 sequence+id 两次写会悄悄改写第一次内容），那里改用自己的
 * tmp + link + unlink（见该文件头部注释）。 */
export const atomicWriteFile = atomicReplaceFile

/**
 * base_branch 探测：读 `<gitdir>/HEAD` 的 `ref: refs/heads/<branch>`（纯 fs、零 spawn）。
 * git worktree/submodule 内 `.git` 是**文件**（`gitdir: <path>` 指针）而非目录——直接
 * readFile(`.git/HEAD`) 会 ENOTDIR 静默回退 main（automation 恰用 worktree）；此处先辨 .git
 * 类型，为文件则解析指针定位真 gitdir 再读 HEAD。
 * detached / 无 git / 读失败 → 回退 "main"（一等态，绝不阻断 init——对齐老内核）。
 */
async function detectBaseBranch(repoRoot: string): Promise<string> {
  try {
    const gitPath = path.join(repoRoot, '.git')
    let gitDir = gitPath
    const st = await stat(gitPath)
    if (!st.isDirectory()) {
      // worktree/submodule：`.git` 文件内为 `gitdir: <path>`（可为绝对或相对仓根）
      const pointer = await readFile(gitPath, 'utf8')
      const pm = /^gitdir:\s*(.+)$/m.exec(pointer)
      if (!pm) return 'main'
      gitDir = path.resolve(repoRoot, pm[1]!.trim())
    }
    const head = await readFile(path.join(gitDir, 'HEAD'), 'utf8')
    const m = /^ref: refs\/heads\/(\S+)$/.exec(head.trim())
    const branch = m?.[1]
    if (branch) return branch
  } catch {
    // 无 git / 指针坏 / 读失败 —— 走回退
  }
  return 'main'
}

/** 老仓 state-init.sh heredoc 的逐字段初值（双 review 由 effective track policy 显式注入）。 */
function initialFields(
  opts: InitOptions, ts: string, baseBranch: string, createdBy: string,
): Record<FieldName, string | string[]> {
  const f = emptyFields()
  f.track = opts.track
  f.preset = opts.preset
  f.created_by = createdBy
  f.assignee = 'null'
  // 缺省 open；custom workflow 首态（opts.initialWorkflow）随这次构造直接生效，不是 init 独占
  // 创建之后再补一次 setMany（见 init() 内的 P1 修复注释）。
  f.phase = opts.initialWorkflow?.phase ?? 'open'
  f.phase_status = 'pending'
  f.design_doc = 'null'
  f.plan = 'null'
  f.verification_report = 'null'
  f.build_mode = 'null'
  f.isolation = 'null'
  f.build_sha = 'null'
  f.agent_review_result = opts.reviewSeed
  f.codex_review_result = opts.reviewSeed
  f.verify_result = 'pending'
  f.branch_status = 'pending'
  f.direct_override = 'false'
  f.prd_path = 'null'
  f.pr_url = 'null'
  f.automation = 'off'
  f.automation_queued_at = ''
  f.automation_sandbox = ''
  f.automation_worktree = ''
  f.automation_attempts = '0'
  f.automation_last_error = ''
  f.automation_preserved_path = ''
  f.branch = 'null'
  f.base_branch = baseBranch
  f.scope = 'null'
  f.related_files = 'null'
  f.spec_scope = 'null'
  f.depends_on = 'null'
  f.created_at = ts
  f.updated_at = ts
  f.verified_at = 'null'
  f.archived_at = 'null'
  f.archived = 'false'
  // workflow 缺省走 emptyFields() 的 'default'；custom workflow 首态显式覆盖（同 phase）。
  // automation_current_phase 缺省空串（run 外无沙箱内阶段，v5 T4），同样由 emptyFields() 覆盖
  // ——这里显式写一遍以对齐「heredoc 逐字段初值」的可读清单。
  if (opts.initialWorkflow) f.workflow = opts.initialWorkflow.workflow
  f.automation_current_phase = ''
  f.automation_cause = '' // 同上——F-b 末尾追加字段,缺省空串(=成因未知),显式列出保持清单完整(评审 nit)
  return f
}

function gateValue(field: FieldName, value: string | string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) quoteGate(field, item)
  } else {
    quoteGate(field, value)
  }
}

function projectionState(revision: RunRevision): PipelineState {
  return {
    ...structuredClone(revision.state),
    projectionMetadata: projectionMetadataFor(revision),
  }
}

function projectionContent(revision: RunRevision): string {
  return serializePipeline(projectionState(revision))
}

function stateWithoutProjection(state: PipelineState): PipelineState {
  return {
    fields: structuredClone(state.fields),
    ...(state.runMetadata === undefined ? {} : { runMetadata: structuredClone(state.runMetadata) }),
    opaqueTail: state.opaqueTail,
  }
}

async function inspectProjectionAgainst(
  changeDir: string,
  current?: RunRevision,
): Promise<StateProjectionStatus> {
  if (current === undefined) return { status: 'legacy' }
  const identity = { revision: current.revision, revisionId: current.revisionId }
  let raw: string
  try {
    raw = await readFile(stateFilePath(changeDir), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing', ...identity }
    throw error
  }
  if (raw === projectionContent(current)) return { status: 'current', ...identity }
  let parsed: PipelineState
  try {
    parsed = parsePipeline(raw)
  } catch (error) {
    return { status: 'drift', ...identity, reason: `YAML adapter 无法解析: ${String(error)}` }
  }
  const metadata = parsed.projectionMetadata
  if (metadata === undefined) {
    // current 已提交但首次 projection 尚未完成的崩溃窗口：legacy bytes 只要语义与 current 完全
    // 一致即可安全前滚；任何字段差异都可能是旧 writer 越过断代点，必须拒绝。
    try {
      if (serializePipeline(stateWithoutProjection(parsed)) === serializePipeline(current.state)) {
        return { status: 'legacy-compatible', ...identity }
      }
    } catch (error) {
      return { status: 'drift', ...identity, reason: `legacy adapter 不可重建: ${String(error)}` }
    }
    return {
      status: 'drift', ...identity,
      reason: 'canonical 存在但 adapter 无 revision 且内容不同',
    }
  }
  const referenced = await readImmutableRunRevision(changeDir, metadata.stateRevision, metadata.stateRevisionId)
  if (referenced !== undefined && referenced.stateDigest === metadata.stateDigest
    && raw === projectionContent(referenced)) return { status: 'stale', ...identity }
  return {
    status: 'drift', ...identity,
    reason: 'revision metadata 与 adapter 内容不一致',
  }
}

class FsStateStore implements StateStore {
  private readonly writeProjection: (target: string, content: string) => Promise<void>

  constructor(options: StateStoreOptions = {}) {
    this.writeProjection = options.writeProjection ?? atomicWriteFile
  }

  async read(changeDir: string): Promise<PipelineState> {
    const current = await readCurrentRunRevision(changeDir)
    if (current !== undefined) return structuredClone(current.state)
    return parsePipeline(await readFile(stateFilePath(changeDir), 'utf8'))
  }

  async write(
    changeDir: string,
    state: PipelineState,
    mutation: StateWriteIntent = { kind: 'replace' },
  ): Promise<StateWriteResult> {
    return withLock(changeDir, () => this.writeUnderLock(changeDir, state, mutation))
  }

  async writeUnderLock(
    changeDir: string,
    state: PipelineState,
    mutation: StateWriteIntent = { kind: 'replace' },
  ): Promise<StateWriteResult> {
    const nextState = stateWithoutProjection(state)
    // current 是唯一提交点；所有可预见的 adapter 表示错误必须在它之前失败，不能先提交再因
    // quote gate 等确定性问题留下永久 pending projection。
    serializePipeline(nextState)
    let current = await readCurrentRunRevision(changeDir)
    if (current === undefined) {
      const legacy = parsePipeline(await readFile(stateFilePath(changeDir), 'utf8'))
      current = await publishInitialRunRevision(changeDir, legacy, defaultClock(), 'migration')
    } else {
      const status = await inspectProjectionAgainst(changeDir, current)
      if (status.status === 'drift') {
        throw new StateProjectionDriftError(`YAML projection drift：${status.reason}`)
      }
    }
    const next = await publishRunRevision(changeDir, current, nextState, {
      kind: mutation.kind,
      observedAt: defaultClock(),
      ...(mutation.transitionRecordId === undefined ? {} : { transitionRecordId: mutation.transitionRecordId }),
    })
    try {
      await this.writeProjection(stateFilePath(changeDir), projectionContent(next))
      return { projection: { status: 'updated' } }
    } catch (error) {
      return { projection: { status: 'pending', error } }
    }
  }

  async get(changeDir: string, field: FieldName): Promise<string | string[] | undefined> {
    const state = await this.read(changeDir)
    return state.fields[field]
  }

  async set(changeDir: string, field: FieldName, value: string | string[]): Promise<void> {
    await this.setMany(changeDir, { [field]: value }, 'set')
  }

  async setMany(
    changeDir: string,
    kv: Partial<Record<FieldName, string | string[]>>,
    mutationKind: 'set' | 'set-many' = 'set-many',
  ): Promise<void> {
    const entries = Object.entries(kv).filter(
      (e): e is [FieldName, string | string[]] => e[1] !== undefined,
    )
    // 闸前置：任一值触闸 → 整批拒绝、零落盘（不进锁）
    for (const [field, value] of entries) gateValue(field, value)
    if (entries.length === 0) return
    await withLock(changeDir, async () => {
      const state = await this.read(changeDir)
      for (const [field, value] of entries) state.fields[field] = value
      await this.writeUnderLock(changeDir, state, { kind: mutationKind })
    })
  }

  async cas(changeDir: string, field: FieldName, expect: string, next: string): Promise<boolean> {
    quoteGate(field, next)
    return withLock(changeDir, async () => {
      const state = await this.read(changeDir)
      if (state.fields[field] !== expect) return false
      state.fields[field] = next
      await this.writeUnderLock(changeDir, state, { kind: 'cas' })
      return true
    })
  }

  async casMany(
    changeDir: string,
    field: FieldName,
    expects: readonly string[],
    kv: Partial<Record<FieldName, string | string[]>>,
  ): Promise<boolean> {
    const entries = Object.entries(kv).filter(
      (e): e is [FieldName, string | string[]] => e[1] !== undefined,
    )
    for (const [entryField, value] of entries) gateValue(entryField, value)
    return withLock(changeDir, async () => {
      const state = await this.read(changeDir)
      const observed = state.fields[field]
      if (typeof observed !== 'string' || !expects.includes(observed)) return false
      for (const [entryField, value] of entries) state.fields[entryField] = value
      await this.writeUnderLock(changeDir, state, { kind: 'cas-many' })
      return true
    })
  }

  async inspectProjection(changeDir: string): Promise<StateProjectionStatus> {
    return inspectProjectionAgainst(changeDir, await readCurrentRunRevision(changeDir))
  }

  async repairProjection(
    changeDir: string,
    opts: RepairProjectionOptions = {},
  ): Promise<StateProjectionStatus> {
    return withLock(changeDir, async () => {
      const current = await readCurrentRunRevision(changeDir)
      if (current === undefined) {
        throw new StateProjectionDriftError('repair-projection: canonical current 不存在；仍是 legacy change')
      }
      const status = await inspectProjectionAgainst(changeDir, current)
      if (status.status === 'current') return status
      if (status.status === 'drift' && opts.forceCanonical !== true) {
        throw new StateProjectionDriftError(
          `repair-projection 拒绝覆盖未知 YAML drift：${status.reason}；显式选择 canonical 覆盖或 legacy import`,
        )
      }
      await this.writeProjection(stateFilePath(changeDir), projectionContent(current))
      return { status: 'current', revision: current.revision, revisionId: current.revisionId }
    })
  }

  async importLegacyProjection(changeDir: string): Promise<StateWriteResult> {
    return withLock(changeDir, async () => {
      const current = await readCurrentRunRevision(changeDir)
      if (current === undefined) {
        throw new StateProjectionDriftError('import-legacy: canonical current 不存在；无需解决双主 drift')
      }
      const legacy = parsePipeline(await readFile(stateFilePath(changeDir), 'utf8'))
      const imported: PipelineState = {
        fields: legacy.fields,
        ...(current.state.runMetadata === undefined
          ? {}
          : { runMetadata: structuredClone(current.state.runMetadata) }),
        opaqueTail: legacy.opaqueTail,
      }
      serializePipeline(imported)
      const next = await publishRunRevision(changeDir, current, imported, {
        kind: 'legacy-import',
        observedAt: defaultClock(),
      })
      try {
        await this.writeProjection(stateFilePath(changeDir), projectionContent(next))
        return { projection: { status: 'updated' } }
      } catch (error) {
        return { projection: { status: 'pending', error } }
      }
    })
  }

  async init(opts: InitOptions): Promise<string> {
    const { name } = opts
    if (!CHANGE_NAME_RE.test(name) || name.includes('..')) {
      throw new Error(`init: 非法 change 名 '${name}'（仅允许 a-zA-Z0-9_-，禁 ..）`)
    }
    const clock = opts.clock ?? defaultClock
    const changeDir = path.join(path.resolve(opts.repoRoot), 'openspec', 'changes', name)
    await mkdir(changeDir, { recursive: true })

    // 快速拒绝顺序/旧版重复 init，避免明知 current/YAML 已存在仍先发布一份不可达 revision。
    // 真并发的两个首次 init 仍由 current 的 no-replace link 决胜；输家可能留下不可达 revision，
    // 与崩溃在 revision 发布后、current 提交前的恢复规则一致，永远不会被官方读路径采用。
    if (await readCurrentRunRevision(changeDir) !== undefined) {
      throw alreadyInitialized(path.join(changeDir, '.pipeline-run', 'current.json'))
    }
    try {
      await readFile(stateFilePath(changeDir), 'utf8')
      throw alreadyInitialized(stateFilePath(changeDir))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const ts = clock()
    const baseBranch = await detectBaseBranch(opts.repoRoot)
    // created_by 是不可信入参：四闸校验挪到构造 fields 之前、纯内存判定——命中闸就地降级回安全
    // 占位 'unknown'，不阻断 init（身份是软信息，绝不允许它写坏状态文件），也不再需要独占创建
    // 之后再补一次 write 才能落这个字段（第 7 轮 codex review P1：那样的两步之间有竞态窗口，
    // 第二步失败还会被调用方吞掉、init 仍报成功）。
    let createdBy = 'unknown'
    if (opts.user !== undefined && opts.user !== '' && opts.user !== 'unknown') {
      try {
        quoteGate('created_by', opts.user)
        createdBy = opts.user
      } catch (err) {
        if (!(err instanceof QuoteGateError)) throw err
      }
    }
    // runId 提供时随独占创建一次性写入 runMetadata（W1 第二增量）；custom workflow 首态
    // （opts.initialWorkflow）同理——这一整个 state 对象在下面同一次原子发布里落盘，不存在
    // "先创建 default/open、再 setMany 改成 custom/首 step"两步竞态（第 7 轮 codex review 另一个
    // P1：两步之间的并发 transition 会对 provisional default/open 提交 canonical record，第二次
    // 写入后 canonical head 与实际 workflow/state 不一致；第二步写失败还会留下一个错误的
    // default change）。写入本身失败则 init 直接抛错（fail-loud，调用方不能吞掉后仍报成功），
    // 成功则身份、custom 首态与其余字段同时可见，没有中间态。
    const state: PipelineState = {
      fields: initialFields(opts, ts, baseBranch, createdBy),
      runMetadata: opts.runId ? { runId: opts.runId, transitionSequence: 0, transitionHead: undefined } : undefined,
      opaqueTail: '',
    }
    // 独占创建的原子性硬化（第 7/8/9 轮 codex review）：wx 只保证"创建时不覆盖已有文件"，不
    // 保证内容整体原子可见——目标路径在 open() 成功的那一刻就已经可被并发 reader 看到，写入
    // 过程中读到空文件/半截内容、或写到一半崩溃留下损坏 target 都是真实风险。发布用共享原语
    // atomicLinkPublish（第 9 轮 codex review：此前这里与 transition-record-store.ts 各自
    // 维护一份几乎相同的 tmp+link+unlink，其中一处的 try/finally 范围漏包了 writeFile 那一步
    // 而另一处没漏，提炼成一份共享实现避免两处继续各自漂移，见该文件头部注释）：link() 目标
    // 已存在时原子失败，与旧版 writeFile(wx) 撞已存在文件同属 EEXIST 错误分类
    // （`.code === 'EEXIST'`），但不是同一种错误——syscall 分别是 open/link，path/message
    // 也不同，全仓没有调用方按这些字段分支，故控制流零回归，但用户可见的报错文本会变化。
    // G1 cutover：完整 revision + current 先提交，YAML 只在 canonical commit 之后投影。
    // current 的独占发布是新 change 的唯一提交点；revision 已发布而 current 未发布时只是孤儿。
    const revision = await publishInitialRunRevision(changeDir, state, ts)
    try {
      await atomicLinkPublish(
        changeDir, '.pipeline.yaml.tmp', stateFilePath(changeDir), projectionContent(revision),
      )
    } catch {
      // current 已经是提交点，不能把 projection 故障伪装成 init 未发生。官方读路径仍可立即使用；
      // inspect/repair-projection 会把缺失 adapter 显式暴露并幂等修复。
    }
    return changeDir
  }

  async withLock<T>(changeDir: string, fn: () => Promise<T>): Promise<T> {
    return withLock(changeDir, fn)
  }
}

/** StateStore 工厂（types.ts 接口的唯一官方入口） */
export function createStateStore(options: StateStoreOptions = {}): StateStore {
  return new FsStateStore(options)
}
