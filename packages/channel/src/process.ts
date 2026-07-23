/**
 * process —— 真进程注入面（真 fork / kill / OS-liveness 探针 / ps cmdline 验证）。
 * 进程层（BACKLOG #27b / GOAL A4 M4）的 OS 边界：supervisor / liveness 经此面碰真进程/真信号，
 * 纯逻辑仍可注入内存 fake 测。
 *
 * 老仓真相源：
 *   · skills/pipeline/scripts/channel/supervisor.py:143（subprocess.Popen PIPE×3 spawn worker）、
 *     :225（channel-state.sh cmd_spawn detached Popen supervisor, start_new_session=True）。
 *   · skills/pipeline/scripts/channel/guard.py:86 _is_supervisor_process（ps -p <pid> -o command=
 *     + 放宽正则 (?:channel\s+__supervisor|channel[./]supervisor)\s+<ch>\s+<worker>；win32→False）、
 *     :143 pid_alive（os.kill(pid,0)：ProcessLookupError→死 / PermissionError→活）。
 *   · skills/pipeline/scripts/channel/shutdown.py:93 kill ladder（child.terminate/child.kill = SIGTERM/SIGKILL）。
 *
 * ★正交红线（与 #27 同律）：进程面只 spawn/kill worker 子进程 + 读 pid/ps，绝不触 barrier/
 *   三门/build_sha/git；worker 只产事件 + 工作树改动，git commit 永远只由主线执行。
 * 零第三方依赖（仅 node:child_process / node:process）。
 */
import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'

/** worker 子进程句柄：stdin 写 / stdout 行 / stderr 抽干 / exit / 信号。 */
export interface WorkerProcess {
  /** OS pid（spawn 失败 → undefined）。 */
  readonly pid: number | undefined
  /** 往 stdin 写（已 close 则吞，supervisor 即将退）。 */
  write(data: string): void
  /** 关 stdin（kill ladder 第一步）。 */
  closeStdin(): void
  /** 行缓冲订阅 stdout（carry 半行，非空行才回调）。 */
  onStdoutLine(cb: (line: string) => void): void
  /** 抽干 stderr（防 PIPE 满阻塞 worker）——整块回调。 */
  onStderr(cb: (chunk: string) => void): void
  /** 成功 spawn（node 'spawn' 事件）。 */
  onSpawn(cb: () => void): void
  /** pre-spawn 失败（ENOENT/EACCES —— node 'error' 事件）。 */
  onError(cb: (err: Error) => void): void
  /** 进程退出（code / signal 之一非空）。 */
  onExit(cb: (code: number | null, signal: string | null) => void): void
  /** 已退出？（对齐 child.poll() is not None）。 */
  exited(): boolean
  /** 发信号给 worker（缺省 SIGTERM）。ESRCH→false。 */
  kill(signal?: NodeJS.Signals): boolean
}

export interface SpawnFaceOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

/** 真 spawn / kill / liveness 注入面（supervisor + liveness 消费；测试注入 fake）。 */
export interface ProcessFace {
  /** 当前进程 pid（supervisor 写 <worker>.pid = 自己的 pid）。 */
  readonly selfPid: number
  /** spawn worker 子进程（PIPE stdin/stdout/stderr）。同步返回句柄；ENOENT 经 onError 异步到达。 */
  spawn(command: string, args: string[], opts?: SpawnFaceOptions): WorkerProcess
  /** detached 起后台进程（start_new_session；stdio ignore；unref）。返回 pid（失败 → undefined）。 */
  spawnDetached(command: string, args: string[], opts?: SpawnFaceOptions): number | undefined
  /** os.kill(pid,0) 语义：ESRCH→false / EPERM→true（存在但无权）。 */
  pidAlive(pid: number): boolean
  /** 发信号给任意 pid（缺省 SIGTERM）。ESRCH/无进程→false。 */
  kill(pid: number, signal?: NodeJS.Signals): boolean
  /** ps cmdline 验证 pid 仍是这个 worker 的 supervisor（防 pid 复用，guard.py:86）。 */
  isSupervisorProcess(pid: number, channel: string, worker: string): boolean
}

/** 行缓冲器：喂 chunk → 吐完整行（carry 半行到下次；非空行才吐）。 */
export function makeLineBuffer(onLine: (line: string) => void): (chunk: string) => void {
  let carry = ''
  return (chunk: string) => {
    carry += chunk
    const lines = carry.split('\n')
    carry = lines.pop() ?? '' // 末段可能是半行 → 留到下次
    for (const line of lines) {
      if (line.trim()) onLine(line)
    }
  }
}

/**
 * ps cmdline 验证（guard.py:86 的 TS 等价）。放宽正则认 shell 壳与 exec 后两形态。
 * win32 / 异常 → false（保守：宁漏判 verified 也不误杀别的进程）。
 */
export function isSupervisorCmdline(cmd: string, channel: string, worker: string): boolean {
  if (!cmd) return false
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ch = esc(channel)
  const wk = esc(worker)
  const pat = new RegExp(`(?:channel\\s+__supervisor|channel[./]supervisor)\\s+${ch}\\s+${wk}(?:\\s|$)`)
  return pat.test(cmd)
}

/** 真 node 进程面（缺省）。 */
export function nodeProcessFace(): ProcessFace {
  return {
    selfPid: process.pid,
    spawn: (command, args, opts) => nodeSpawnWorker(command, args, opts),
    spawnDetached: (command, args, opts) => {
      try {
        const child = spawn(command, args, {
          cwd: opts?.cwd,
          env: mergeEnv(opts?.env),
          detached: true,
          stdio: 'ignore',
        })
        const pid = child.pid
        child.unref()
        return pid
      } catch {
        return undefined
      }
    },
    pidAlive: (pid) => pidAliveReal(pid),
    kill: (pid, signal = 'SIGTERM') => {
      if (!pid) return false
      try {
        process.kill(pid, signal)
        return true
      } catch {
        return false
      }
    },
    isSupervisorProcess: (pid, channel, worker) => {
      if (process.platform === 'win32') return false
      if (!pid) return false
      try {
        const out = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
          encoding: 'utf8',
          timeout: 5000,
        })
        const cmd = (out.stdout ?? '').trim()
        return isSupervisorCmdline(cmd, channel, worker)
      } catch {
        return false
      }
    },
  }
}

function pidAliveReal(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function mergeEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv | undefined {
  if (!extra) return process.env
  const out: NodeJS.ProcessEnv = { ...process.env }
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete out[k]
    else out[k] = v
  }
  return out
}

function nodeSpawnWorker(command: string, args: string[], opts?: SpawnFaceOptions): WorkerProcess {
  const spawnOpts: SpawnOptions = {
    cwd: opts?.cwd,
    env: mergeEnv(opts?.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  }
  const child = spawn(command, args, spawnOpts)
  let exitedFlag = false
  child.on('exit', () => {
    exitedFlag = true
  })
  if (child.stdout) child.stdout.setEncoding('utf8')
  if (child.stderr) child.stderr.setEncoding('utf8')
  return {
    get pid() {
      return child.pid
    },
    write: (data) => {
      try {
        child.stdin?.write(data)
      } catch {
        /* stdin 关——吞 */
      }
    },
    closeStdin: () => {
      try {
        child.stdin?.end()
      } catch {
        /* best-effort */
      }
    },
    onStdoutLine: (cb) => {
      const feed = makeLineBuffer(cb)
      child.stdout?.on('data', (chunk: string) => feed(chunk))
    },
    onStderr: (cb) => {
      child.stderr?.on('data', (chunk: string) => cb(chunk))
    },
    onSpawn: (cb) => {
      child.on('spawn', cb)
    },
    onError: (cb) => {
      child.on('error', cb)
    },
    onExit: (cb) => {
      child.on('exit', (code, signal) => cb(code, signal))
    },
    exited: () => exitedFlag,
    kill: (signal = 'SIGTERM') => {
      try {
        return child.kill(signal)
      } catch {
        return false
      }
    },
  }
}
