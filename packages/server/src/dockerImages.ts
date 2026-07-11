/**
 * T3(v6 计划):docker 镜像列表探测——GET /api/docker/images 数据面。
 *
 * 决策 B.1(proposal):server 直接 execFile docker(对齐 afk.ts:257-259 docker kill 先例),
 * 不反向依赖 automation 包的 dockerAvailable(server 对 automation 零运行时依赖纪律)。
 * 异常收敛:超时(缺省 5s)/非零退出/spawn 失败 → { available:false, images:[] },绝不上抛
 * ——docker 不装/没起是常态不是错误,HTTP 层恒 200(ok:true),前端按 available 降级纯文本框。
 * execDocker 导出供 T4(/api/afk/readiness 的 docker info / image inspect 探测)复用同一
 * 超时与收敛口径。
 */
import { execFile } from 'node:child_process'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** 注入面:测试喂 fake,生产走 nodeExecDocker(真 execFile)。 */
export type ExecDockerFn = (args: readonly string[]) => Promise<ExecResult>

const nodeExecDocker: ExecDockerFn = (args) =>
  new Promise((resolve) => {
    execFile('docker', [...args], (err, stdout, stderr) => {
      // err.code:退出码是 number;spawn 失败(ENOENT 等)是 string——后者一律按 1 收敛。
      const code = (err as { code?: unknown } | null)?.code
      const exitCode = err === null ? 0 : typeof code === 'number' ? code : 1
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode })
    })
  })

/** 带超时的 docker 调用:超时/exec 抛错统一按「不可用」收敛(返回 null),不上抛。 */
export async function execDocker(
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
    const result = await Promise.race([exec(args).catch(() => null), timeout])
    return result
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export interface DockerImagesResult {
  available: boolean
  images: string[]
}

/** repo:tag 列表(排序去重,过滤含 <none> 的悬空镜像行)。 */
export async function listDockerImages(
  exec?: ExecDockerFn,
  opts?: { timeoutMs?: number },
): Promise<DockerImagesResult> {
  const result = await execDocker(['images', '--format', '{{.Repository}}:{{.Tag}}'], {
    timeoutMs: opts?.timeoutMs,
    exec,
  })
  if (result === null || result.exitCode !== 0) return { available: false, images: [] }
  const images = [
    ...new Set(
      result.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.includes('<none>')),
    ),
  ].sort()
  return { available: true, images }
}
