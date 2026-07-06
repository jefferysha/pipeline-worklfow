/**
 * docker 探针 + 最小容器执行（BACKLOG #29，注入 exec 面）。
 *
 * 老仓真相源：runner/src/sandboxes/docker.ts + DockerLifecycle.ts（起真容器、bind-mount、
 * checkImageUid / --user / --cpus）。lite 这里只保留**探针 + 最小真跑**，全链隔离沙箱留 #29c。
 *
 * 诚实门（延续老仓 automation/README.md:130-134）：dockerAvailable 是 IT 的 skip 判据——无 docker
 * daemon → docker.integration.test.ts honest skip（ctx.skip，vitest 计 skipped）+ 打印原因，
 * **绝不伪绿**。exec 注入让纯逻辑（探针语义）可测，真跑走真 execFile。
 */

/** 子进程 exec 注入面（file + args → 结果，永不 throw，用 exitCode 表达失败）。 */
export type Exec = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>

/**
 * docker daemon 是否可用（`docker info` exit 0）。任何异常/非零 → false（fail-safe，IT 据此 skip）。
 */
export const dockerAvailable = async (exec: Exec): Promise<boolean> => {
  try {
    const r = await exec('docker', ['info'])
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * 真起一个最小 `--rm` 容器跑一条命令，回读 stdout。非零退出抛错（不吞）。
 * IT 用它证明"有 docker 就真跑最小容器"（echo）——真实证据，不 mock。
 */
export const runMinimalContainer = async (exec: Exec, image: string, cmd: string[]): Promise<string> => {
  const r = await exec('docker', ['run', '--rm', image, ...cmd])
  if (r.exitCode !== 0) {
    throw new Error(`docker run ${image} failed (exit ${r.exitCode}): ${r.stderr.slice(0, 200)}`)
  }
  return r.stdout
}
