/**
 * docker 容器全链（BACKLOG #29c，DESIGN §4.1/§4.5/§7）—— 移植老仓 DockerLifecycle.ts:107-196
 * （startContainer 起 detached 容器 + bind-mount + env + --user + --cpus）+ sandboxes/docker.ts:188-294
 * （dockerExecOp 流式 exec + removeContainer 优雅 stop+rm）。
 *
 * 真 `node:child_process`（注入 ExecFn 面）：argv 组装是纯逻辑（gitMounts→-v 双挂载、env→-e、
 * --user uid:gid、--cpus、-w workdir、image 末位），真起容器/真 exec/真 rm 走 IT。缺 docker →
 * container.integration.test.ts honest skip，绝不伪绿。
 *
 * UID/GID 对齐（DESIGN §7-item5）：容器写文件 UID 错位会污染 host worktree，故 --user uid:gid。
 * git 双挂载（§4.5）：worktree 的 .git 是 gitdir: 指针，必须同时挂 .git 文件 + 父 .git 目录。
 */
import type { ExecFn, ExecResult } from './exec.js'
import type { GitMount } from './gitMounts.js'
import type { SandboxHandle } from '../lifecycle/lifecycle.js'

/** detached 容器保活命令（无长驻 entrypoint 的镜像靠它维持存活以便 docker exec）。 */
export const KEEPALIVE_CMD: readonly string[] = ['sleep', '2147483647']

/**
 * bind-mount 格式化为 `-v` 串：`hostPath:sandboxPath[:ro][,z]`（老仓 mountUtils.ts:58-67）。
 * SELinux label `z`（共享标，非 SELinux 系统为 no-op）；readonly → 叠 ro。
 */
const formatVolumeMount = (m: GitMount & { readonly?: boolean }): string => {
  const base = `${m.hostPath}:${m.sandboxPath}`
  const options = [m.readonly ? 'ro' : undefined, 'z'].filter((o): o is string => o !== undefined).join(',')
  return `${base}:${options}`
}

export interface ContainerRunOptions {
  readonly name: string
  readonly image: string
  readonly env?: Record<string, string>
  readonly gitMounts?: readonly GitMount[]
  readonly worktreePath?: string
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
}

/** 组装 `docker run -d --name … [-e K=V] [-v host:sandbox] [--user u:g] [--cpus n] [-w wd] <image>`。 */
export const buildContainerRunArgs = (opts: ContainerRunOptions): string[] => {
  const envFlags = Object.entries(opts.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  // git 双挂载：各 host==sandbox（gitdir: 指针在容器内按同绝对路径解析）。SELinux 标默认 z。
  const volumeFlags = (opts.gitMounts ?? []).flatMap((m) => ['-v', formatVolumeMount(m)])
  const userFlags = opts.uid !== undefined && opts.gid !== undefined ? ['--user', `${opts.uid}:${opts.gid}`] : []
  const cpusFlags = opts.cpus !== undefined ? ['--cpus', String(opts.cpus)] : []
  const workdirFlags = opts.worktreePath ? ['-w', opts.worktreePath] : []
  return [
    'run',
    '-d',
    '--name',
    opts.name,
    ...envFlags,
    ...volumeFlags,
    ...userFlags,
    ...cpusFlags,
    ...workdirFlags,
    opts.image, // image 末位（buildContainerRunArgs 契约；保活命令由 startContainer 追加）
  ]
}

/** 组装 `docker exec [-w cwd] <name> sh -c <command>`（command 整条走 sh -c，避开 argv 拆词）。 */
export const buildExecArgs = (name: string, command: string, opts?: { cwd?: string }): string[] => {
  const cwdFlags = opts?.cwd ? ['-w', opts.cwd] : []
  return ['exec', ...cwdFlags, name, 'sh', '-c', command]
}

/** 真起 detached 容器（run -d + 保活命令）。非零退出抛错（不吞）。 */
export const startContainer = async (exec: ExecFn, opts: ContainerRunOptions): Promise<string> => {
  const args = [...buildContainerRunArgs(opts), ...KEEPALIVE_CMD]
  const r = await exec('docker', args)
  if (r.exitCode !== 0) {
    throw new Error(`docker run ${opts.image} failed (exit ${r.exitCode}): ${r.stderr.slice(0, 300)}`)
  }
  return opts.name
}

/** 真 `docker exec`（可流式 onLine）；结果直透（永不伪造 pass，非零 exitCode 由调用面判）。 */
export const execInContainer = (
  exec: ExecFn,
  name: string,
  command: string,
  opts?: { cwd?: string; onLine?: (l: string) => void },
): Promise<ExecResult> => exec('docker', buildExecArgs(name, command, { cwd: opts?.cwd }), { onLine: opts?.onLine })

/** 优雅移除容器：stop 后 rm，两步都吞错（已停/已删是正常清理竞态，老仓 removeContainer:193-196）。 */
export const removeContainer = async (exec: ExecFn, name: string): Promise<void> => {
  await exec('docker', ['stop', name]).catch(() => {})
  await exec('docker', ['rm', name]).catch(() => {})
}

export interface CreateSandboxOptions {
  readonly image: string
  readonly worktreePath: string
  readonly env: Record<string, string>
  readonly gitMounts?: readonly GitMount[]
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
}

/** 起真容器并返回 #29 SandboxHandle（exec=docker exec，close=stop+rm 杀容器不泄漏）。 */
export const createDockerSandbox = async (exec: ExecFn, opts: CreateSandboxOptions): Promise<SandboxHandle> => {
  const name = `sandcastle-${randomName()}`
  await startContainer(exec, {
    name,
    image: opts.image,
    env: opts.env,
    gitMounts: opts.gitMounts,
    worktreePath: opts.worktreePath,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus,
  })
  return {
    env: opts.env,
    containerName: name,
    exec: (cmd, options) => execInContainer(exec, name, cmd, { cwd: opts.worktreePath, onLine: options?.onLine }),
    close: () => removeContainer(exec, name),
  }
}

/** 容器名后缀（时间戳 + 随机 6-hex，防同秒撞名；不引 crypto 也够用）。 */
const randomName = (): string => `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
