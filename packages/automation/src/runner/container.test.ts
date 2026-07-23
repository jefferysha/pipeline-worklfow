import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from './exec.js'
import {
  buildContainerRunArgs,
  buildExecArgs,
  copyAndSealDirectoryInContainer,
  createDockerSandbox,
  removeContainer,
  SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE,
} from './container.js'

/**
 * docker 容器 argv 组装（老仓 DockerLifecycle.ts:107-185 startContainer + docker.ts dockerExecOp）。
 * 纯逻辑真单测 + fake ExecFn 驱动全链（无 docker daemon 也真跑 argv/wiring，真起容器走 IT）。
 */
describe('buildContainerRunArgs（gitMounts / env / user / cpus 组装）', () => {
  const base = {
    name: 'sandcastle-abc',
    image: 'sandcastle:local',
    env: { PIPELINE_AFK: '1', HOME: '/home/agent' },
    gitMounts: [
      { hostPath: '/wt/.git', sandboxPath: '/wt/.git' },
      { hostPath: '/repo/.git', sandboxPath: '/repo/.git' },
    ],
    worktreePath: '/wt',
    uid: 501,
    gid: 20,
    cpus: 2,
  }

  it('detached + --name + image 末位', () => {
    const a = buildContainerRunArgs(base)
    expect(a[0]).toBe('run')
    expect(a).toContain('-d')
    expect(a.slice(a.indexOf('--name'), a.indexOf('--name') + 2)).toEqual(['--name', 'sandcastle-abc'])
    expect(a[a.length - 1]).toBe('sandcastle:local')
  })

  it('env → -e K=V（含 PIPELINE_AFK=1 放行三门）', () => {
    const a = buildContainerRunArgs(base)
    expect(a).toContain('-e')
    expect(a.join(' ')).toContain('PIPELINE_AFK=1')
  })

  it('gitMounts → -v host:sandbox（双挂载各 host==sandbox）', () => {
    const a = buildContainerRunArgs(base)
    const joined = a.join(' ')
    expect(joined).toContain('-v /wt/.git:/wt/.git')
    expect(joined).toContain('-v /repo/.git:/repo/.git')
  })

  it('--user uid:gid + --cpus + -w workdir', () => {
    const a = buildContainerRunArgs(base)
    expect(a.slice(a.indexOf('--user'), a.indexOf('--user') + 2)).toEqual(['--user', '501:20'])
    expect(a.slice(a.indexOf('--cpus'), a.indexOf('--cpus') + 2)).toEqual(['--cpus', '2'])
    expect(a.slice(a.indexOf('-w'), a.indexOf('-w') + 2)).toEqual(['-w', '/wt'])
  })

  it('Codex workspace-write：仅显式开启时给 bwrap 所需 SYS_ADMIN + unconfined seccomp', () => {
    const enabled = buildContainerRunArgs({ ...base, codexWorkspaceSandbox: true })
    expect(enabled).toContain('--cap-add')
    expect(enabled.slice(enabled.indexOf('--cap-add'), enabled.indexOf('--cap-add') + 2))
      .toEqual(['--cap-add', 'SYS_ADMIN'])
    expect(enabled.slice(enabled.indexOf('--security-opt'), enabled.indexOf('--security-opt') + 2))
      .toEqual(['--security-opt', 'seccomp=unconfined'])

    const disabled = buildContainerRunArgs(base)
    expect(disabled).not.toContain('--cap-add')
    expect(disabled).not.toContain('--security-opt')
  })
})

describe('buildExecArgs', () => {
  it('exec <name> sh -c <command>', () => {
    expect(buildExecArgs('c1', 'echo hi')).toEqual(['exec', 'c1', 'sh', '-c', 'echo hi'])
  })
  it('-w cwd 注入', () => {
    expect(buildExecArgs('c1', 'ls', { cwd: '/wt' })).toEqual(['exec', '-w', '/wt', 'c1', 'sh', '-c', 'ls'])
  })
})

describe('createDockerSandbox（fake ExecFn 驱动 create→exec→close 全链，无 docker）', () => {
  const makeFakeExec = () => {
    const calls: string[][] = []
    const exec: ExecFn = async (file, args) => {
      calls.push([file, ...args])
      // docker run -d ... → 打印容器 id；docker exec → echo；stop/rm → 空
      const res: ExecResult = { stdout: args[0] === 'run' ? 'cid123\n' : 'exec-out\n', stderr: '', exitCode: 0 }
      return res
    }
    return { exec, calls }
  }

  it('create 真起容器（docker run -d），exec 走 docker exec，close 走 stop+rm', async () => {
    const { exec, calls } = makeFakeExec()
    const handle = await createDockerSandbox(exec, {
      image: 'sandcastle:local',
      worktreePath: '/wt',
      env: { PIPELINE_AFK: '1' },
      gitMounts: [{ hostPath: '/wt/.git', sandboxPath: '/wt/.git' }],
    })
    expect(handle.env.PIPELINE_AFK).toBe('1')
    expect(handle.containerName).toMatch(/^sandcastle-/) // 真容器名透传（供 lifecycle 写回 automation_sandbox）
    expect(calls[0][1]).toBe('run') // docker run -d ...

    const r = await handle.exec('echo hi')
    expect(r.exitCode).toBe(0)
    expect(calls.some((c) => c[1] === 'exec')).toBe(true) // docker exec

    await handle.close()
    expect(calls.some((c) => c[1] === 'rm')).toBe(true) // docker rm（清容器）
  })
})

describe('removeContainer（H14 r3：清理结果必须由真实 exit code 证明）', () => {
  it('stop/rm 都非零且 inspect 证明容器仍存在 → fail-loud，绝不把泄漏伪装成已清理', async () => {
    const calls: string[][] = []
    const exec: ExecFn = async (file, args) => {
      calls.push([file, ...args])
      if (args[0] === 'inspect') return { stdout: '[{}]\n', stderr: '', exitCode: 0 }
      return { stdout: '', stderr: 'daemon unavailable', exitCode: 1 }
    }

    await expect(removeContainer(exec, 'sandcastle-leaked')).rejects.toMatchObject({
      _tag: 'ContainerCleanupError',
      containerName: 'sandcastle-leaked',
    })
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ['docker', 'stop'],
      ['docker', 'rm'],
      ['docker', 'inspect'],
    ])
  })

  it('stop 非零但 rm=0 → 最终 absent 不能消音 stop 执行故障，仍 fail-loud', async () => {
    const exec: ExecFn = async (_file, args) => args[0] === 'rm'
      ? { stdout: 'sandcastle-gone\n', stderr: '', exitCode: 0 }
      : { stdout: '', stderr: 'container is not running', exitCode: 1 }

    await expect(removeContainer(exec, 'sandcastle-gone')).rejects.toMatchObject({
      _tag: 'ContainerCleanupError',
      failures: [{ operation: 'stop', exitCode: 1, detail: 'container is not running' }],
    })
  })

  it('stop 抛异常但 rm=0 → 保留原始 stop 异常诊断并 fail-loud', async () => {
    const exec: ExecFn = async (_file, args) => {
      if (args[0] === 'stop') throw new Error('docker transport broke')
      return { stdout: 'sandcastle-gone\n', stderr: '', exitCode: 0 }
    }

    await expect(removeContainer(exec, 'sandcastle-gone')).rejects.toMatchObject({
      _tag: 'ContainerCleanupError',
      failures: [{ operation: 'stop', detail: 'docker transport broke' }],
    })
  })

  it('rm 未知失败、inspect 明确 absent → absent 只核终态，不能抹掉 rm 执行故障', async () => {
    const exec: ExecFn = async (_file, args) => {
      if (args[0] === 'stop') return { stdout: 'sandcastle-gone\n', stderr: '', exitCode: 0 }
      if (args[0] === 'inspect') {
        return { stdout: '', stderr: 'Error: No such object: sandcastle-gone', exitCode: 1 }
      }
      return { stdout: '', stderr: 'daemon timeout', exitCode: 1 }
    }

    await expect(removeContainer(exec, 'sandcastle-gone')).rejects.toMatchObject({
      _tag: 'ContainerCleanupError',
      failures: [{ operation: 'rm', exitCode: 1, detail: 'daemon timeout' }],
    })
  })

  it('rm 明确返回 Docker 的 No such container → 只把这一已知幂等 absent 结局视为成功', async () => {
    const exec: ExecFn = async () => ({
      stdout: '', stderr: 'Error response from daemon: No such container: sandcastle-absent', exitCode: 1,
    })

    await expect(removeContainer(exec, 'sandcastle-absent')).resolves.toBeUndefined()
  })
})

describe('buildContainerRunArgs（普通 ContainerMount.readonly → 挂载追加 :ro）', () => {
  it('gitMounts 条目标 readonly:true → 该条渲染 :ro,z；未标记条目保持既有 :z（可写，零回归）', () => {
    const a = buildContainerRunArgs({
      name: 'sandcastle-abc',
      image: 'sandcastle:local',
      gitMounts: [
        { hostPath: '/wt/.git', sandboxPath: '/wt/.git' },
        { hostPath: '/repo/templates', sandboxPath: '/opt/pipeline/templates', readonly: true },
      ],
    })
    const joined = a.join(' ')
    expect(joined).toContain('-v /wt/.git:/wt/.git:z')
    expect(joined).toContain('-v /repo/templates:/opt/pipeline/templates:ro,z')
  })
})

describe('copyAndSealDirectoryInContainer（H10 r5）', () => {
  it('严格按 root prepare → docker cp 目录内容 → root chown/chmod seal 执行', async () => {
    const calls: string[][] = []
    const exec: ExecFn = async (file, args) => {
      calls.push([file, ...args])
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    await copyAndSealDirectoryInContainer(exec, 'sandbox-c1', '/repo/cas/digest', '/opt/pipeline-run/skill-bundle')

    expect(calls).toEqual([
      [
        'docker', 'exec', '-u', '0', 'sandbox-c1', 'sh', '-c',
        'rm -rf "$1" && mkdir -p "$1"', 'pipeline-stage', '/opt/pipeline-run/skill-bundle',
      ],
      ['docker', 'cp', '/repo/cas/digest/.', 'sandbox-c1:/opt/pipeline-run/skill-bundle'],
      [
        'docker', 'exec', '-u', '0', 'sandbox-c1', 'sh', '-c',
        'chown -R 0:0 "$1" && chmod -R a+rX,a-w "$1"', 'pipeline-seal', '/opt/pipeline-run/skill-bundle',
      ],
    ])
  })
})

/**
 * H10 r1 复审阻断5（任务C1）：容器内 skill bundle 校验的保留退出码——两侧手工同步的唯一机器可
 * 核对耦合点（见 SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE 头注「一致性来源」）。本测试不真跑 docker
 * （真容器验证见 container.integration.test.ts），只钉住"改一侧忘了改另一侧"这类静态漂移：
 *   ① 常量值本身与已占用的 95/96/97（脚本版本对账漂移/codex 缺失/tap 未起）不冲突；
 *   ② 仓库脚本文本真的以本常量值作为最终 `exit <N>`（防"改了 container.ts 的常量、忘了同步改
 *      脚本里的字面量 94"这类只改一侧的漂移——脚本内嵌 node 代码里另有 `process.exit(1)`，
 *      那是 node 脚本自身的通用失败码，被 shell 侧翻译成保留码之前的中间态，不是本测试要钉的
 *      对外契约值，故用行首 `exit ` + 数字这个更精确的模式，不误配内嵌 JS 里的 `process.exit(1)`）。
 */
describe('SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE（H10 r1 阻断5/任务C1）：与 pipeline-afk-run.sh 保持同步', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const scriptPath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh')

  it('保留退出码不与既有 95（脚本对账漂移）/96（codex 缺失）/97（tap 未起）冲突', () => {
    expect(SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE).not.toBe(95)
    expect(SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE).not.toBe(96)
    expect(SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE).not.toBe(97)
  })

  it('仓库脚本真的以本常量值 exit（shell 侧把 node 校验器的失败翻译成这个保留码）', () => {
    const script = readFileSync(scriptPath, 'utf8')
    const exitLines = script.match(/^\s*exit \d+$/gm) ?? []
    expect(exitLines.some((l) => l.trim() === `exit ${SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE}`)).toBe(true)
  })
})
