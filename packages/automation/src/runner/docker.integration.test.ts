import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Exec, dockerAvailable, runMinimalContainer } from './docker.js'

const execFileAsync = promisify(execFile)

/**
 * 真 docker 集成测试（诚实门，延续老仓 automation/README.md:130-134）。
 *
 *   · 无 docker daemon → honest skip（context.skip()，vitest 计为 skipped，绝不伪绿）+ 打印原因。
 *   · 无 CLAUDE_CODE_OAUTH_TOKEN → full CC-in-sandbox 那类 skip 并注明缺什么。
 *   · 有 docker → 真起最小容器真跑一条命令，断言真实 stdout。
 *   · 任何路径都不为绿伪造 pass。
 */
const realExec: Exec = async (file, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { encoding: 'utf-8' })
    return { stdout, stderr, exitCode: 0 }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number }
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? String(e), exitCode: typeof err.code === 'number' ? err.code : 1 }
  }
}

let hasDocker = false

describe('docker runner 集成', () => {
  beforeAll(async () => {
    hasDocker = await dockerAvailable(realExec)
    if (!hasDocker) {
      console.warn('[HONEST SKIP] docker daemon 不可用（docker info 失败）——IT 跳过，绝不伪绿。装 docker 后本地/CI 真跑。')
    }
  })

  it('dockerAvailable 探针返回布尔（无论有无 docker 都真跑）', async () => {
    const v = await dockerAvailable(realExec)
    expect(typeof v).toBe('boolean')
  })

  it('真起最小容器跑命令并回读 stdout', async (ctx) => {
    if (!hasDocker) {
      ctx.skip() // honest skip：不伪造 pass
      return
    }
    const out = await runMinimalContainer(realExec, 'alpine', ['echo', 'afk-ok'])
    expect(out.trim()).toContain('afk-ok')
  }, 120_000)

  it('full Claude-Code-in-sandbox pipeline（需 docker + CLAUDE_CODE_OAUTH_TOKEN）', (ctx) => {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (!hasDocker) {
      console.warn('[HONEST SKIP] 缺 docker → full CC-in-sandbox 跳过')
      ctx.skip()
      return
    }
    if (!token) {
      console.warn('[HONEST SKIP] 缺 CLAUDE_CODE_OAUTH_TOKEN → full CC-in-sandbox 跳过（缺沙箱内 CC 认证）')
      ctx.skip()
      return
    }
    // 占位用例：全链 CC-in-sandbox（#29c 的 docker 全链 + 真 agent）在本仓没有实现，故 docker 与
    // token 都齐备时也无条件 skip。后果：该链路零自动化覆盖——上面两条 skip 只是把「缺依赖」
    // 与「没实现」分开报，不代表给了 token 就会真跑。
    ctx.skip()
  })
})
