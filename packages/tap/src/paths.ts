/**
 * tap 栈共享的文件系统路径锚（单一真相源）。
 *
 * 老仓真相源（严格只读移植）:
 *   - skills/pipeline/scripts/tap/paths.py:7  safe_home（HOME 缺失回落用户私有 tmp，闭 /tmp symlink 风险）
 *   - skills/pipeline/scripts/tap/trace_store.py:53  resolve_db_path（PIPELINE_TAP_DB / XDG_DATA_HOME / ~/.local/share/pipeline-tap）
 *   - skills/pipeline/scripts/tap/capture_state.py:14  _state_dir（PIPELINE_TAP_STATE_DIR / PIPELINE_TAP_DB parent / share dir）
 *
 * 结构改进：老仓 trace_store 落 SQLite（traces.sqlite3）；本仓按 GOAL B3「JSONL 侧文件」哲学
 * 改为本地 JSONL/文件（零第三方运行时依赖，node stdlib only）。默认目录不变。
 */
import { homedir, tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

/** 返回用户 HOME；缺失（CI / launchd）回落**用户私有** tmp（mode 0700），不落裸 /tmp。 */
export function safeHome(): string {
  const h = homedir()
  if (h && h.length > 0) return h
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : 'nouid'
  const base = join(tmpdir(), `pipeline-tap-${uid}`)
  try {
    mkdirSync(base, { recursive: true, mode: 0o700 })
  } catch {
    /* best-effort；上层再 mkdir */
  }
  return base
}

export interface TapDirOptions {
  /** 显式目录（hermetic 测试注入；生产不设即走 env/home 解析）。 */
  dir?: string
  /** 覆盖 env 读取（默认 process.env）——测试隔离用。 */
  env?: NodeJS.ProcessEnv
}

/**
 * 捕获数据 + 状态标志的规范本地目录。
 * 解析优先级：opts.dir → PIPELINE_TAP_DIR → PIPELINE_TAP_DB(父目录) → XDG_DATA_HOME/pipeline-tap
 *            → safeHome()/.local/share/pipeline-tap。
 */
export function resolveTapDir(opts: TapDirOptions = {}): string {
  if (opts.dir) return resolve(opts.dir)
  const env = opts.env ?? process.env
  const explicit = (env.PIPELINE_TAP_DIR ?? '').trim()
  if (explicit) return resolve(explicit)
  const db = (env.PIPELINE_TAP_DB ?? '').trim()
  if (db) return resolve(dirname(resolve(db)))
  const xdg = (env.XDG_DATA_HOME ?? '').trim()
  if (xdg) return resolve(join(xdg, 'pipeline-tap'))
  return resolve(join(safeHome(), '.local', 'share', 'pipeline-tap'))
}

/** 录制开关标志目录（默认与 tap 目录同处；可经 PIPELINE_TAP_STATE_DIR 覆盖）。 */
export function resolveStateDir(opts: TapDirOptions = {}): string {
  if (opts.dir) return resolve(opts.dir)
  const env = opts.env ?? process.env
  const override = (env.PIPELINE_TAP_STATE_DIR ?? '').trim()
  if (override) return resolve(override)
  return resolveTapDir(opts)
}
