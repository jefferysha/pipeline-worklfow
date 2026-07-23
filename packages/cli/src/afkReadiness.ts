/**
 * cli 侧 AFK 就绪探测（full-install R1）——`pipeline setup runtime` 与 `pipeline doctor afk:*` 共用。
 *
 * 与 server `afkReadiness.ts` 逐字段对称（同响应形状、docker info→image inspect 短路、
 * 「没装 docker / 没建镜像 / 没配凭证」皆常态不抛），差别只在凭证来源:
 *   · server：探针内 readSecrets(secretsPath) 读文件；
 *   · cli   ：secrets 已由 deps.readSecretsEnv 读成 env 形状注入（secretsEnv），探针零文件 IO——
 *             它是「即将 afk run 的 shell 当刻」权威（P1-X1：终端 doctor/setup 为凭证权威，
 *             比 dashboard server 快照更准）。
 *
 * docker 直接 execFile（对齐 cli afk.ts docker kill 先例，零 automation/server 依赖）；超时/spawn 失败
 * 统一按「不可用」收敛（返回 null），绝不上抛。build_hint 走 kernel 单一真相源常量（防漂移）。
 */
import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { SANDCASTLE_BUILD_HINT } from '@pipeline-lite/kernel'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** 注入面:测试喂 fake，生产走 nodeExecDocker（真 execFile）。 */
export type ExecDockerFn = (args: readonly string[]) => Promise<ExecResult>

/** 真 docker 调用（原始 exec，超时由 execDocker 包裹）。spawn 失败(ENOENT 等)一律按退出码 1 收敛。 */
export const nodeExecDocker: ExecDockerFn = (args) =>
  new Promise((resolve) => {
    execFile('docker', [...args], (err, stdout, stderr) => {
      const code = (err as { code?: unknown } | null)?.code
      const exitCode = err === null ? 0 : typeof code === 'number' ? code : 1
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode })
    })
  })

/** 带超时的 docker 调用:超时 / exec 抛错统一按「不可用」收敛（返回 null），不上抛。 */
async function execDocker(
  args: readonly string[],
  opts?: { timeoutMs?: number; exec?: ExecDockerFn },
): Promise<ExecResult | null> {
  const exec = opts?.exec ?? nodeExecDocker
  const timeoutMs = opts?.timeoutMs ?? 5000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs)
    })
    return await Promise.race([exec(args).catch(() => null), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export interface CredLight {
  set: boolean
  source?: 'host-env' | 'secrets-file' | 'default-home'
}

export interface AfkReadiness {
  ok: true
  docker: { available: boolean }
  image: { configured: string; present: boolean; build_hint: string }
  credentials: {
    'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: CredLight }
    codex: { OPENAI_API_KEY: CredLight; CODEX_HOME: CredLight }
  }
}

/** 单键凭证灯:宿主 env 非空 > secrets 文件非空 > 缺席（空串 env 视同缺席，同 T2 合并语义;永不回值）。 */
function credLight(
  key: 'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY',
  hostEnv: Readonly<Record<string, string | undefined>>,
  secretsEnv: Readonly<Record<string, string>>,
): CredLight {
  const envVal = hostEnv[key]
  if (envVal !== undefined && envVal !== '') return { set: true, source: 'host-env' }
  const fileVal = secretsEnv[key]
  if (fileVal !== undefined && fileVal !== '') return { set: true, source: 'secrets-file' }
  return { set: false }
}

function canReadFile(path: string): boolean {
  try {
    accessSync(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

/** CODEX_HOME 不进 secrets store；显式 env 优先，否则只认默认 home 下可读的 auth.json。 */
function codexHomeLight(
  hostEnv: Readonly<Record<string, string | undefined>>,
  defaultCodexHome?: string,
  canRead: (path: string) => boolean = canReadFile,
): CredLight {
  const v = hostEnv.CODEX_HOME
  if (v !== undefined && v !== '') return { set: true, source: 'host-env' }
  if (defaultCodexHome && canRead(join(defaultCodexHome, 'auth.json'))) return { set: true, source: 'default-home' }
  return { set: false }
}

/**
 * AFK 运行时就绪探测:docker info → image inspect（探测1 失败短路探测2，不浪费一次超时）+ 两 runner
 * 凭证 set/未设。凭证两侧对称真探真值（claude-code 的 CLAUDE_CODE_OAUTH_TOKEN + codex 的
 * OPENAI_API_KEY/CODEX_HOME），永不回值。docker 不可用一律降级 available:false，绝不抛。
 */
export async function probeAfkReadiness(opts: {
  image: string
  exec?: ExecDockerFn
  secretsEnv?: Readonly<Record<string, string>>
  hostEnv?: Readonly<Record<string, string | undefined>>
  defaultCodexHome?: string
  canReadFile?: (path: string) => boolean
  timeoutMs?: number
}): Promise<AfkReadiness> {
  const hostEnv = opts.hostEnv ?? process.env
  const secretsEnv = opts.secretsEnv ?? {}

  const info = await execDocker(['info'], { exec: opts.exec, timeoutMs: opts.timeoutMs })
  const available = info !== null && info.exitCode === 0
  let present = false
  if (available) {
    const inspect = await execDocker(['image', 'inspect', opts.image], { exec: opts.exec, timeoutMs: opts.timeoutMs })
    present = inspect !== null && inspect.exitCode === 0
  }

  return {
    ok: true,
    docker: { available },
    image: { configured: opts.image, present, build_hint: SANDCASTLE_BUILD_HINT },
    credentials: {
      'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: credLight('CLAUDE_CODE_OAUTH_TOKEN', hostEnv, secretsEnv) },
      codex: {
        OPENAI_API_KEY: credLight('OPENAI_API_KEY', hostEnv, secretsEnv),
        CODEX_HOME: codexHomeLight(hostEnv, opts.defaultCodexHome, opts.canReadFile),
      },
    },
  }
}
