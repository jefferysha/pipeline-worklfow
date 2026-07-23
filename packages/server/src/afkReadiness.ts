/**
 * T4(v6 计划):AFK 就绪三灯探测——GET /api/afk/readiness?root= 数据面。
 * 契约=proposal 附录 D.1:
 *   探测1 docker 可用(docker info,复用 T3 execDocker 的 5s 超时/收敛口径);
 *   探测2 配置镜像存在(docker image inspect;探测1 失败短路,不浪费一次超时);
 *   探测3 凭证已配 per-runner(纯文件+env,零子进程)——永不回值,只回 set+source,
 *     source 以实际生效者为准(C4 优先级:宿主 env 非空 > secrets 文件;空串 env 视同缺席,
 *     同 T2 hostEnv 合并语义)。
 * 「没装 docker/没建镜像/没配凭证」都是常态不是错误:本模块不抛,HTTP 层恒 200。
 */
import { accessSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { readSecrets, SANDCASTLE_BUILD_HINT } from '@pipeline-lite/kernel'
import { execDocker, type ExecDockerFn } from './dockerImages.js'

// P1-X1 防漂移：build_hint 单一真相源迁至 kernel（见 kernel types.ts SANDCASTLE_BUILD_HINT）。
// 本地不再重复定义字面串；仍 re-export 保持本模块既有导出面不破。
export { SANDCASTLE_BUILD_HINT }

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

function credLight(
  key: 'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY',
  hostEnv: Readonly<Record<string, string | undefined>>,
  fileKeys: Partial<Record<string, string>>,
): CredLight {
  const envVal = hostEnv[key]
  if (envVal !== undefined && envVal !== '') return { set: true, source: 'host-env' }
  if (fileKeys[key] !== undefined && fileKeys[key] !== '') return { set: true, source: 'secrets-file' }
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

export async function buildAfkReadiness(opts: {
  image: string
  secretsPath: string
  exec?: ExecDockerFn
  hostEnv?: Readonly<Record<string, string | undefined>>
  defaultCodexHome?: string
  canReadFile?: (path: string) => boolean
  timeoutMs?: number
}): Promise<AfkReadiness> {
  const hostEnv = opts.hostEnv ?? process.env
  const fileKeys = readSecrets(opts.secretsPath).keys

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
      'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: credLight('CLAUDE_CODE_OAUTH_TOKEN', hostEnv, fileKeys) },
      codex: {
        OPENAI_API_KEY: credLight('OPENAI_API_KEY', hostEnv, fileKeys),
        CODEX_HOME: codexHomeLight(hostEnv, opts.defaultCodexHome, opts.canReadFile),
      },
    },
  }
}
