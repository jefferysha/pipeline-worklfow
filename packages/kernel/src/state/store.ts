/**
 * StateStore —— `.pipeline.yaml` 读写层（types.ts 接口的文件系统实现）。
 * 读写走窄解析器（parse.ts），互斥走 mkdir 原子锁（lock.ts），init 对齐老仓
 * skills/pipeline/scripts/state-init.sh 的 heredoc 语义。kernel 零第三方运行时依赖。
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  QuoteGateError,
  type FieldName,
  type InitOptions,
  type PipelineState,
  type StateStore,
} from '../types.js'
import { withLock } from './lock.js'
import { emptyFields, parsePipeline, quoteGate, serializePipeline } from './parse.js'

export const STATE_FILE_NAME = '.pipeline.yaml'

/** 对齐老内核 validate_change_name：非空、仅 [a-zA-Z0-9_-]、禁 ..（path traversal） */
const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/

/** 缺省时钟：ISO8601 UTC 秒级精度，对齐老内核 `date -u +%Y-%m-%dT%H:%M:%SZ` */
function defaultClock(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

function stateFilePath(changeDir: string): string {
  return path.join(changeDir, STATE_FILE_NAME)
}

let tmpSeq = 0
/** 同目录 tmp + rename，写入原子可见（对齐老内核 `> tmp && mv`） */
async function atomicWriteFile(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp.${process.pid}.${tmpSeq++}`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, file)
}

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

/** 老仓 state-init.sh heredoc 的逐字段初值（pm track → 双 review 种 skipped） */
function initialFields(opts: InitOptions, ts: string, baseBranch: string): Record<FieldName, string | string[]> {
  const reviewInit = opts.track === 'pm' ? 'skipped' : 'pending'
  const f = emptyFields()
  f.track = opts.track
  f.preset = opts.preset
  f.created_by = 'unknown' // 安全占位；真值经四闸后写（见 init）
  f.assignee = 'null'
  f.phase = 'open'
  f.phase_status = 'pending'
  f.design_doc = 'null'
  f.plan = 'null'
  f.verification_report = 'null'
  f.build_mode = 'null'
  f.isolation = 'null'
  f.build_sha = 'null'
  f.agent_review_result = reviewInit
  f.codex_review_result = reviewInit
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
  // workflow 走 emptyFields() 缺省 'default'（init 不显式设）；automation_current_phase 缺省
  // 空串（run 外无沙箱内阶段，v5 T4），同样由 emptyFields() 覆盖——这里显式写一遍以对齐
  // 「heredoc 逐字段初值」的可读清单。
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

class FsStateStore implements StateStore {
  async read(changeDir: string): Promise<PipelineState> {
    return parsePipeline(await readFile(stateFilePath(changeDir), 'utf8'))
  }

  async write(changeDir: string, state: PipelineState): Promise<void> {
    await atomicWriteFile(stateFilePath(changeDir), serializePipeline(state))
  }

  async get(changeDir: string, field: FieldName): Promise<string | string[] | undefined> {
    const state = await this.read(changeDir)
    return state.fields[field]
  }

  async set(changeDir: string, field: FieldName, value: string | string[]): Promise<void> {
    await this.setMany(changeDir, { [field]: value })
  }

  async setMany(changeDir: string, kv: Partial<Record<FieldName, string | string[]>>): Promise<void> {
    const entries = Object.entries(kv).filter(
      (e): e is [FieldName, string | string[]] => e[1] !== undefined,
    )
    // 闸前置：任一值触闸 → 整批拒绝、零落盘（不进锁）
    for (const [field, value] of entries) gateValue(field, value)
    if (entries.length === 0) return
    await withLock(changeDir, async () => {
      const state = await this.read(changeDir)
      for (const [field, value] of entries) state.fields[field] = value
      await this.write(changeDir, state)
    })
  }

  async cas(changeDir: string, field: FieldName, expect: string, next: string): Promise<boolean> {
    quoteGate(field, next)
    return withLock(changeDir, async () => {
      const state = await this.read(changeDir)
      if (state.fields[field] !== expect) return false
      state.fields[field] = next
      await this.write(changeDir, state)
      return true
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

    const ts = clock()
    const baseBranch = await detectBaseBranch(opts.repoRoot)
    const state: PipelineState = { fields: initialFields(opts, ts, baseBranch), opaqueTail: '' }
    const content = serializePipeline(state)
    // wx 独占创建：已初始化的 change fail-loud 拒绝（不覆盖既有状态/历史）
    await writeFile(stateFilePath(changeDir), content, { encoding: 'utf8', flag: 'wx' })

    // heredoc 先落安全占位 unknown；user 真值（不可信入参）经四闸写入——
    // 命中闸 → 保留 unknown、不阻断 init（身份是软信息，绝不允许它写坏状态文件）。
    if (opts.user !== undefined && opts.user !== '' && opts.user !== 'unknown') {
      try {
        await this.set(changeDir, 'created_by', opts.user)
      } catch (err) {
        if (!(err instanceof QuoteGateError)) throw err
      }
    }
    return changeDir
  }

  async withLock<T>(changeDir: string, fn: () => Promise<T>): Promise<T> {
    return withLock(changeDir, fn)
  }
}

/** StateStore 工厂（types.ts 接口的唯一官方入口） */
export function createStateStore(): StateStore {
  return new FsStateStore()
}
