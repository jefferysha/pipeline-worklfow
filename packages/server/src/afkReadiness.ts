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
import { readSecrets } from '@pipeline-lite/kernel'
import { execDocker, type ExecDockerFn } from './dockerImages.js'

export const SANDCASTLE_BUILD_HINT = 'bash tools/sandcastle/build.sh'

export interface CredLight {
  set: boolean
  source?: 'host-env' | 'secrets-file'
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

/** CODEX_HOME 只看宿主 env(决策 C2b:路径不进 secrets store)。 */
function codexHomeLight(hostEnv: Readonly<Record<string, string | undefined>>): CredLight {
  const v = hostEnv.CODEX_HOME
  return v !== undefined && v !== '' ? { set: true, source: 'host-env' } : { set: false }
}

export async function buildAfkReadiness(opts: {
  image: string
  secretsPath: string
  exec?: ExecDockerFn
  hostEnv?: Readonly<Record<string, string | undefined>>
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
        CODEX_HOME: codexHomeLight(hostEnv),
      },
    },
  }
}
