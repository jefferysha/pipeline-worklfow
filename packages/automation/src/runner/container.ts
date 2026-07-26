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
 * H10 r1 复审阻断5（任务C1）：容器内、agent 启动前的 skill bundle 完整校验保留退出码。
 * `tools/sandcastle/tenon-afk-run.sh` 内嵌的 node 校验脚本（Claude 与 Codex 两条 agent 分派
 * 分支之前，脚本头部统一执行）直接对 host 已用 `docker cp` 放入并 root-seal 的容器私有固定目录
 * 重算 canonical manifest + 聚合 digest。结果与宿主经
 * `docker run -e` 注入的 `TENON_SKILL_BUNDLE_SHA256`（out-of-band——不是从即将被校验的目录本身
 * 读出来的）不一致时，以本退出码终止整个脚本——绝不继续到任何 agent 分派。通过后 env 与 prompt
 * 始终指向该固定私有目录；host CAS 没有挂载进容器，后续修改不可能影响 agent 读取的内容。
 *
 * `ports.ts::runWork` 据此从 docker exec 的 `ExecResult.exitCode` 识别"这是容器内 skill bundle
 * 校验失败"这一特定失败类，抛出与 host 侧预检（`ports.ts::verifySkillBundleSnapshot`）同一个
 * `SkillBundleSnapshotMismatchError`（同一 `_tag`）——`scheduler/classify.ts` 既有的按 tag 分类
 * （H10 任务B1 已接线：`cause:'skill-bundle-snapshot-corrupt'` → `kind:'conflict'` + 结算
 * `charge:'none'`）对这条运行期路径因此自动生效，不需要 classify.ts/scheduler.ts 再感知"这次是
 * 容器内检出还是 host 侧检出"——两处检出共用同一个错误类型，是它们汇合于同一套结算断言的唯一
 * 原因（不是巧合，也不需要在 scheduler 层再加一次特判）。
 *
 * 一致性来源（如实说明，不是"两处运行同一份代码"）：容器内嵌的校验脚本是与
 * `skills/snapshot-store.ts::buildCanonicalManifest` / `computePublishDigest` 手工同步的等价
 * 实现——容器与 host 之间没有跨语言共享同一份编译产物的机制（容器内没有 host 的 TS 编译链，也
 * 不会临时挂载 host 源码目录去 `require` 它，那样反而多一份可被篡改的挂载内容，扩大攻击面）；
 * 算法步骤（按 relativePath 排序、逐文件 sha256、executable 位取 `mode & 0o111`、
 * combinedFiles/skillsSummary/provenance 三段式聚合后 `JSON.stringify` 取 sha256）逐一对照手写。
 * 两侧改动算法必须同步维护——本常量与脚本内校验失败分支的退出码，是这份手工同步纪律里唯一
 * 机器可核对的耦合点（`container.test.ts` 有同步测试：脚本文本必须出现与本常量相同的数值）。
 *
 * 保留退出码需避开脚本内已占用位：95 = 脚本版本对账漂移
 * （`runner.ts::AFK_RUN_DRIFT_EXIT_CODE`）、96 = codex CLI 缺失、97 = tap proxy 未起（均见脚本内
 * 联注释）。skillBundle 缺席（none-bundle 直通/非 loop AFK 直跑，`TENON_SKILL_BUNDLE_DIR` 未
 * 注入）时脚本内直接跳过整段校验，exitCode 不可能等于本保留码，对这类 run 零行为影响。
 */
export const SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE = 94

/**
 * 通用 bind mount 描述，可叠加只读标记。skill CAS 明确不走此接口；它由
 * `copyAndSealDirectoryInContainer` 复制进容器私有层。readonly 仍供脚本/配置等普通挂载使用。
 */
export interface ContainerMount extends GitMount {
  readonly?: boolean
}

/**
 * bind-mount 格式化为 `-v` 串：`hostPath:sandboxPath[:ro][,z]`（老仓 mountUtils.ts:58-67）。
 * SELinux label `z`（共享标，非 SELinux 系统为 no-op）；readonly → 叠 ro。
 */
const formatVolumeMount = (m: ContainerMount): string => {
  const base = `${m.hostPath}:${m.sandboxPath}`
  const options = [m.readonly ? 'ro' : undefined, 'z'].filter((o): o is string => o !== undefined).join(',')
  return `${base}:${options}`
}

export interface ContainerRunOptions {
  readonly name: string
  readonly image: string
  readonly env?: Record<string, string>
  readonly gitMounts?: readonly ContainerMount[]
  readonly worktreePath?: string
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
  /**
   * Codex `--sandbox workspace-write` 在 Docker 内用 bubblewrap 创建 user/mount namespace。
   * Docker 缺省 seccomp/capability 会让所有 file_change/command_execution 以 bwrap namespace
   * 初始化失败。仅 Codex 容器开启最小已实测组合；agent 命令仍在 Codex workspace-write
   * namespace 内执行，Claude/fallback 容器不获得这些外层能力。
   */
  readonly codexWorkspaceSandbox?: boolean
}

/** 组装 `docker run -d --name … [-e K=V] [-v host:sandbox] [--user u:g] [--cpus n] [-w wd] <image>`。 */
export const buildContainerRunArgs = (opts: ContainerRunOptions): string[] => {
  const envFlags = Object.entries(opts.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  // git 双挂载：各 host==sandbox（gitdir: 指针在容器内按同绝对路径解析）。SELinux 标默认 z。
  const volumeFlags = (opts.gitMounts ?? []).flatMap((m) => ['-v', formatVolumeMount(m)])
  const userFlags = opts.uid !== undefined && opts.gid !== undefined ? ['--user', `${opts.uid}:${opts.gid}`] : []
  const cpusFlags = opts.cpus !== undefined ? ['--cpus', String(opts.cpus)] : []
  const codexSandboxFlags = opts.codexWorkspaceSandbox === true
    ? ['--cap-add', 'SYS_ADMIN', '--security-opt', 'seccomp=unconfined']
    : []
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
    ...codexSandboxFlags,
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

const requireDockerSuccess = (operation: string, result: ExecResult): void => {
  if (result.exitCode !== 0) {
    throw new Error(`${operation} failed (exit ${result.exitCode}): ${(result.stderr || result.stdout).slice(0, 300)}`)
  }
}

/**
 * 把 host 目录内容复制进已启动容器的私有 writable layer，再由 root 把整棵树封成 root-owned、
 * 所有人可读/可遍历且无人可写。这里刻意不用 bind mount：`docker cp` 返回后，host 对 sourceDir 的
 * 任何后续修改都不再能改变 destinationDir；调用方仍须在 agent 启动前对容器内字节做 digest 复核。
 */
export const copyAndSealDirectoryInContainer = async (
  exec: ExecFn,
  name: string,
  sourceDir: string,
  destinationDir: string,
): Promise<void> => {
  const prepare = await exec('docker', [
    'exec', '-u', '0', name, 'sh', '-c',
    'rm -rf "$1" && mkdir -p "$1"',
    'pipeline-stage', destinationDir,
  ])
  requireDockerSuccess(`docker exec root prepare ${destinationDir}`, prepare)

  const sourceContents = `${sourceDir.replace(/\/+$/, '')}/.`
  const copied = await exec('docker', ['cp', sourceContents, `${name}:${destinationDir}`])
  requireDockerSuccess(`docker cp ${sourceContents} ${name}:${destinationDir}`, copied)

  const sealed = await exec('docker', [
    'exec', '-u', '0', name, 'sh', '-c',
    'chown -R 0:0 "$1" && chmod -R a+rX,a-w "$1"',
    'pipeline-seal', destinationDir,
  ])
  requireDockerSuccess(`docker exec root seal ${destinationDir}`, sealed)
}

export interface ContainerCleanupFailure {
  readonly operation: 'stop' | 'rm' | 'inspect'
  readonly exitCode?: number
  readonly detail: string
}

/**
 * stop/rm 无法证明容器已消失时的结构化故障。`_tag` 供 scheduler fail-loud 分类；原始 exit code 与
 * stderr/stdout 摘要保留在 failures，诊断绝不靠一句笼统的“清理失败”。
 */
export class ContainerCleanupError extends Error {
  override readonly name = 'ContainerCleanupError'
  readonly _tag = 'ContainerCleanupError'
  constructor(
    readonly containerName: string,
    readonly failures: readonly ContainerCleanupFailure[],
  ) {
    super(`docker container cleanup failed for ${containerName}: ${failures.map((failure) =>
      `${failure.operation}${failure.exitCode === undefined ? '' : ` exit=${failure.exitCode}`}: ${failure.detail}`,
    ).join('; ')}`)
  }
}

type CleanupAttempt =
  | { readonly result: ExecResult }
  | { readonly thrown: unknown }

const cleanupAttempt = async (exec: ExecFn, args: string[]): Promise<CleanupAttempt> => {
  try {
    return { result: await exec('docker', args) }
  } catch (thrown) {
    // ExecFn 的生产契约是 never-throw；这里仍收住违规注入/运行时异常，并把它当真实清理失败上报。
    return { thrown }
  }
}

const attemptDetail = (attempt: CleanupAttempt): string => {
  if ('thrown' in attempt) return attempt.thrown instanceof Error ? attempt.thrown.message : String(attempt.thrown)
  return (attempt.result.stderr || attempt.result.stdout || '(无诊断输出)').trim().slice(0, 500)
}

const attemptExitCode = (attempt: CleanupAttempt): number | undefined =>
  'result' in attempt ? attempt.result.exitCode : undefined

/** Docker 对幂等删除的稳定 absent 信号；其它 daemon/permission/context 错误一律不能冒充 absent。 */
const isKnownContainerAbsent = (attempt: CleanupAttempt): boolean =>
  'result' in attempt
  && attempt.result.exitCode !== 0
  && /\bNo such (?:container|object)\b/i.test(`${attempt.result.stderr}\n${attempt.result.stdout}`)

const failedAttempt = (
  operation: ContainerCleanupFailure['operation'],
  attempt: CleanupAttempt,
  detail = attemptDetail(attempt),
): ContainerCleanupFailure => ({ operation, exitCode: attemptExitCode(attempt), detail })

/**
 * 优雅移除容器：始终尝试 stop→rm。每一步只有 exit=0 或 Docker 明确的
 * “No such container/object” 才算成功；后一步的成功不能消音前一步的执行故障。rm 未能给出这两种
 * 可信结论时追加 inspect 诊断，但即使 inspect 证明最终 absent，也仍上报 rm 的真实故障。
 */
export const removeContainer = async (exec: ExecFn, name: string): Promise<void> => {
  const stopped = await cleanupAttempt(exec, ['stop', name])
  const removed = await cleanupAttempt(exec, ['rm', name])

  const failures: ContainerCleanupFailure[] = []
  if (!(('result' in stopped && stopped.result.exitCode === 0) || isKnownContainerAbsent(stopped))) {
    failures.push(failedAttempt('stop', stopped))
  }
  if (!(('result' in removed && removed.result.exitCode === 0) || isKnownContainerAbsent(removed))) {
    failures.push(failedAttempt('rm', removed))
    const inspected = await cleanupAttempt(exec, ['inspect', name])
    if (!isKnownContainerAbsent(inspected)) {
      failures.push('result' in inspected && inspected.result.exitCode === 0
        ? failedAttempt('inspect', inspected, 'container still exists after docker rm')
        : failedAttempt('inspect', inspected))
    }
  }
  if (failures.length > 0) throw new ContainerCleanupError(name, failures)
}

export interface CreateSandboxOptions {
  readonly image: string
  readonly worktreePath: string
  readonly env: Record<string, string>
  readonly gitMounts?: readonly ContainerMount[]
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
  readonly codexWorkspaceSandbox?: boolean
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
    codexWorkspaceSandbox: opts.codexWorkspaceSandbox,
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
