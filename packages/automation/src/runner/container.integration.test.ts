import { beforeAll, describe, expect, it } from 'vitest'
import { dockerAvailable } from './docker.js'
import { nodeExec } from './exec.js'
import { createDockerSandbox } from './container.js'
import { parseSandboxReport } from './runner.js'

/**
 * 真 docker 全链集成（诚实门，延续老仓 automation/README.md:130-134 + GOAL 诚实门）。
 *
 *   · 无 docker daemon → honest skip（ctx.skip()，vitest 计 skipped，绝不伪绿）+ 打印缺什么。
 *   · 有 docker → 真起容器（docker run -d）→ 真 docker exec 跑命令 + 回读 <output> 握手 → 真 rm 清容器。
 *   · full CC-in-sandbox（需 docker + CLAUDE_CODE_OAUTH_TOKEN + pipeline 镜像）→ honest skip 注明缺什么。
 *   · 任何路径都不为绿伪造 pass。
 */
let hasDocker = false

describe('docker 全链 · 真容器生命周期集成', () => {
  beforeAll(async () => {
    hasDocker = await dockerAvailable(async (file, args) => nodeExec(file, args))
    if (!hasDocker) {
      console.warn('[HONEST SKIP] docker daemon 不可用（docker info 失败）——真容器全链 IT 跳过，绝不伪绿。装 docker 后本地/CI 真跑。')
    }
  })

  it('真起容器 → docker exec 跑命令 → 回读 <output> 握手 → 真清容器', async (ctx) => {
    if (!hasDocker) {
      ctx.skip()
      return
    }
    const handle = await createDockerSandbox(nodeExec, {
      image: 'alpine',
      worktreePath: '/tmp',
      env: { PIPELINE_AFK: '1' },
    })
    try {
      // 真 docker exec：打印一个结构化握手，证明 exec 回读链路真跑（用 runner 的真解析器）。
      const r = await handle.exec('echo \'<output>{"verify_result":"pass","phase_event":"verify-pass"}</output>\'')
      expect(r.exitCode).toBe(0)
      const report = parseSandboxReport(r.stdout)
      expect(report.verify_result).toBe('pass')
    } finally {
      await handle.close() // 真 docker stop + rm，容器不泄漏
    }
  }, 120_000)

  it('full Claude-Code-in-sandbox pipeline（需 docker + CLAUDE_CODE_OAUTH_TOKEN + pipeline 镜像）', (ctx) => {
    if (!hasDocker) {
      console.warn('[HONEST SKIP] 缺 docker → full CC-in-sandbox 跳过')
      ctx.skip()
      return
    }
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.warn('[HONEST SKIP] 缺 CLAUDE_CODE_OAUTH_TOKEN → full CC-in-sandbox 跳过（缺沙箱内 CC 认证）')
      ctx.skip()
      return
    }
    // full CC-in-sandbox 链路在本仓无自动化覆盖：它需要预构建 pipeline 镜像 + 真 agent，本用例只到
    // 容器可用性为止。给了 token 也不会真跑该链路——本条 skip 与上面「缺 docker」那条是两回事，
    // 分开报是为了让「缺依赖」与「没覆盖」在输出里可区分。
    console.warn('[HONEST SKIP] full CC-in-sandbox 链路无自动化覆盖：需预构建 pipeline 镜像 + 真 agent')
    ctx.skip()
  })
})
