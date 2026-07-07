import { describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from './exec.js'
import {
  buildContainerRunArgs,
  buildExecArgs,
  createDockerSandbox,
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
