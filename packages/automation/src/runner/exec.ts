/**
 * 子进程 exec 注入面（BACKLOG #29c docker 全链）—— git / docker 真命令的统一 execFile/spawn 封装。
 *
 * 老仓真相源：
 *   - lifecycle/git.ts:49-67 execGit（LC_ALL=C + 64MiB maxBuffer，非零 reject 携 stderr）。
 *   - runner/sandboxes/docker.ts:188-252 dockerExecOp（spawn + readline 逐行 + BoundedTail 64KiB）。
 *
 * 诚实门：ExecFn **永不 throw**——用 exitCode 表达失败（非零退出真实透传，绝不吞成绿）。
 * onLine 走 spawn 逐行流式（race idle 检测 + BoundedTail 滚动尾部），**stdout/stderr 双流都挂**
 * ——CLI 把 [TRANSITION] 成功信号打到 stderr（transition.ts），只挂 stdout 会让 phaseWatch 在
 * 真实链路永远收不到行（T4 评审修复；phaseWatch 只认整行格式，双流交错无害）。无 onLine/无
 * input 走 buffered execFile。注入面让纯逻辑（argv 组装 / race 判定）单测，真跑走真 execFile/spawn（IT）。
 */
import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { BoundedTail, MAX_TAIL_CHARS } from './boundedTail.js'

export interface ExecOpts {
  readonly cwd?: string
  /** 叠加到 process.env 之上的 env（如 LC_ALL=C）。 */
  readonly env?: Record<string, string>
  /** 逐行流式回调（走 spawn + readline，stdout 与 stderr 都续传）；race idle-timeout 靠它感知活跃。 */
  readonly onLine?: (line: string) => void
  /** 写进子进程 stdin（heredoc/长 prompt，避开 128KB per-arg 限制）。 */
  readonly input?: string
  /** onLine 流式时每流保留的滚动尾部上限（默认 64KiB）。 */
  readonly maxTailChars?: number
}

export interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** file + args (+opts) → 结果（永不 throw；exitCode 表达失败）。 */
export type ExecFn = (file: string, args: string[], opts?: ExecOpts) => Promise<ExecResult>

const mergedEnv = (env?: Record<string, string>): NodeJS.ProcessEnv =>
  env ? { ...process.env, ...env } : process.env

const spawnStreaming = (file: string, args: string[], opts: ExecOpts): Promise<ExecResult> =>
  new Promise<ExecResult>((resolve) => {
    const maxTail = opts.maxTailChars ?? MAX_TAIL_CHARS
    const proc = spawn(file, args, {
      cwd: opts.cwd,
      env: mergedEnv(opts.env),
      stdio: [opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    if (opts.input !== undefined && proc.stdin) {
      proc.stdin.write(opts.input)
      proc.stdin.end()
    }
    const stdoutTail = new BoundedTail(maxTail, '\n')
    // onLine 流式时 stderr 也逐行（tail 以 '\n' 重组）；buffered 分支维持 chunk 原样累积（'' 分隔）。
    const stderrTail = new BoundedTail(maxTail, opts.onLine ? '\n' : '')
    if (opts.onLine && proc.stdout) {
      const rl = createInterface({ input: proc.stdout })
      rl.on('line', (line) => {
        stdoutTail.push(line)
        opts.onLine?.(line)
      })
    } else {
      proc.stdout?.on('data', (chunk: Buffer) => stdoutTail.push(chunk.toString()))
    }
    if (opts.onLine && proc.stderr) {
      // T4 评审修复：CLI 的 [TRANSITION] 成功信号走 stderr——stderr 不续传 onLine，phaseWatch
      // 在真实链路（docker exec）永远检不出运行期阶段。stderr 同样逐行续传（phaseWatch 只认
      // 整行格式，与 stdout 交错无害；race idle 检测把 stderr 活跃也算活跃，语义更真）。
      const rlErr = createInterface({ input: proc.stderr })
      rlErr.on('line', (line) => {
        stderrTail.push(line)
        opts.onLine?.(line)
      })
    } else {
      proc.stderr?.on('data', (chunk: Buffer) => stderrTail.push(chunk.toString()))
    }
    // spawn error（可执行文件不存在等）→ 归一成非零退出（诚实：不 throw，用 exitCode 表达）。
    proc.on('error', (err) => {
      stderrTail.push(String((err as Error).message ?? err))
      resolve({ stdout: stdoutTail.toString(), stderr: stderrTail.toString(), exitCode: 127 })
    })
    proc.on('close', (code) => {
      resolve({ stdout: stdoutTail.toString(), stderr: stderrTail.toString(), exitCode: code ?? 0 })
    })
  })

/** 生产实现：真 execFile/spawn（永不 throw）。测试注入 fake ExecFn 录 argv。 */
export const nodeExec: ExecFn = (file, args, opts) => {
  if (opts?.onLine || opts?.input !== undefined) return spawnStreaming(file, args, opts)
  return new Promise<ExecResult>((resolve) => {
    execFile(
      file,
      args,
      { cwd: opts?.cwd, env: mergedEnv(opts?.env), maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: code })
      },
    )
  })
}
