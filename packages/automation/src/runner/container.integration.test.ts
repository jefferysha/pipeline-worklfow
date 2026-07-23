import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PreparedSkillBundle } from '../admission/execution-context.js'
import { SKILL_BUNDLE_CONTAINER_DIR } from '../lifecycle/lifecycle.js'
import { createLifecyclePorts } from '../lifecycle/ports.js'
import { materializeSkillSnapshot } from '../skills/snapshot-store.js'
import { dockerAvailable } from './docker.js'
import { nodeExec, type ExecFn } from './exec.js'
import { createDockerSandbox, SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE } from './container.js'
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

  const seedBundle = async (root: string, content: string): Promise<{
    published: Awaited<ReturnType<typeof materializeSkillSnapshot>>
    bundle: PreparedSkillBundle
    hostSkillPath: string
  }> => {
    const skillDir = join(root, 'source', 'demo-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), content, 'utf8')
    const published = await materializeSkillSnapshot(
      [{ skillId: 'demo-skill', contentDir: skillDir }],
      { projectRoot: root },
    )
    const bundle: PreparedSkillBundle = {
      snapshotSha256: published.digest,
      casRelativePath: relative(root, published.casDir),
      resolutionSource: 'default',
      slots: [{
        token: 'primary', alternatives: ['demo-skill'], concreteSkillId: 'demo-skill',
        treeSha256: published.manifests[0]!.treeSha256,
      }],
    }
    return {
      published,
      bundle,
      hostSkillPath: join(published.casDir, 'skills', 'demo-skill', 'SKILL.md'),
    }
  }

  it('H10 r5：无 host CAS mount；复制后 host 改源不影响 agent，非 root agent 写/chmod bundle 均失败', async (ctx) => {
    if (!hasDocker) {
      ctx.skip()
      return
    }
    const root = await mkdtemp(join(tmpdir(), 'container-cp-sealed-bundle-'))
    let handle: Awaited<ReturnType<ReturnType<typeof createLifecyclePorts>['createSandbox']>> | undefined
    try {
      const workDir = join(root, 'work')
      await mkdir(workDir, { recursive: true })
      await chmod(workDir, 0o777)
      const { published, bundle, hostSkillPath } = await seedBundle(root, '# trusted container demo\n')
      const ports = createLifecyclePorts({
        exec: nodeExec,
        hostRepoDir: root,
        image: 'node:22-alpine',
        uid: 12345,
        gid: 12345,
      })
      handle = await ports.createSandbox({
        worktreePath: '/work',
        env: {
          PIPELINE_SKILL_BUNDLE_DIR: SKILL_BUNDLE_CONTAINER_DIR,
          PIPELINE_SKILL_BUNDLE_SHA256: published.digest,
        },
        skillBundle: bundle,
      })

      const inspected = await nodeExec('docker', ['inspect', '--format', '{{json .Mounts}}', handle.containerName])
      expect(inspected.exitCode).toBe(0)
      const mounts = JSON.parse(inspected.stdout) as { Source?: string; Destination?: string }[]
      expect(mounts.some((mount) => mount.Source === published.casDir)).toBe(false)
      expect(mounts.some((mount) => mount.Destination === SKILL_BUNDLE_CONTAINER_DIR)).toBe(false)

      await chmod(hostSkillPath, 0o644)
      await writeFile(hostSkillPath, '# hostile host mutation after validation\n', 'utf8')
      const containerSkillPath = `${SKILL_BUNDLE_CONTAINER_DIR}/skills/demo-skill/SKILL.md`
      const read = await handle.exec(`cat '${containerSkillPath}'`)
      expect(read.exitCode).toBe(0)
      expect(read.stdout).toBe('# trusted container demo\n')
      const sealedMetadata = await handle.exec(
        `stat -c '%u:%g %a' '${SKILL_BUNDLE_CONTAINER_DIR}' '${containerSkillPath}'`,
      )
      expect(sealedMetadata.exitCode).toBe(0)
      expect(sealedMetadata.stdout.trim().split('\n')).toEqual(['0:0 555', '0:0 444'])
      expect((await handle.exec(`printf '# agent write\\n' > '${containerSkillPath}'`)).exitCode).not.toBe(0)
      expect((await handle.exec(`chmod u+w '${containerSkillPath}'`)).exitCode).not.toBe(0)
    } finally {
      await handle?.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it('H10 r5：host 校验后、docker cp 前篡改源 → 入口 exit 94，Codex agent sentinel 从未运行', async (ctx) => {
    if (!hasDocker) {
      ctx.skip()
      return
    }
    const root = await mkdtemp(join(tmpdir(), 'container-cp-tamper-'))
    let handle: Awaited<ReturnType<ReturnType<typeof createLifecyclePorts>['createSandbox']>> | undefined
    try {
      const workDir = join(root, 'work')
      const fakeBin = join(workDir, 'fake-bin')
      const agentSentinel = join(workDir, 'agent-ran')
      await mkdir(fakeBin, { recursive: true })
      await chmod(workDir, 0o777)
      const { published, bundle, hostSkillPath } = await seedBundle(root, '# trusted before transfer\n')

      const writeExecutable = async (name: string, body: string): Promise<void> => {
        const path = join(fakeBin, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await writeExecutable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await writeExecutable('git', `#!/bin/sh
case "\${1:-}" in
  config|add|commit) exit 0 ;;
  rev-parse) printf '%s\\n' '${'4'.repeat(40)}'; exit 0 ;;
  *) exit 91 ;;
esac
`)
      await writeExecutable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await writeExecutable('codex', '#!/bin/sh\nprintf "agent-ran\\n" > "$AGENT_SENTINEL"\n')
      await writeExecutable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  [ "$#" -gt 0 ] || exit 92
  shift
  exec "$@"
fi
exit 93
`)
      const scriptPath = join(workDir, 'pipeline-afk-run.sh')
      await writeFile(
        scriptPath,
        await readFile(join(process.cwd(), 'tools', 'sandcastle', 'pipeline-afk-run.sh'), 'utf8'),
        'utf8',
      )
      await chmod(scriptPath, 0o755)

      let tampered = false
      const tamperingExec: ExecFn = async (file, args, opts) => {
        if (!tampered && file === 'docker' && args[0] === 'cp') {
          tampered = true
          await chmod(hostSkillPath, 0o644)
          await writeFile(hostSkillPath, '# tampered between host verify and docker cp\n', 'utf8')
        }
        return nodeExec(file, args, opts)
      }
      const ports = createLifecyclePorts({
        exec: tamperingExec,
        hostRepoDir: root,
        image: 'node:22-alpine',
        uid: 12345,
        gid: 12345,
      })
      handle = await ports.createSandbox({
        worktreePath: workDir,
        env: {
          PATH: `${fakeBin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
          PIPELINE_RUNNER: 'codex',
          PIPELINE_SKILL_BUNDLE_DIR: SKILL_BUNDLE_CONTAINER_DIR,
          PIPELINE_SKILL_BUNDLE_SHA256: published.digest,
          AGENT_SENTINEL: agentSentinel,
        },
        skillBundle: bundle,
      })
      expect(tampered).toBe(true)

      const result = await handle.exec(`sh '${scriptPath}' demo-change`)
      expect(result.exitCode).toBe(SKILL_BUNDLE_VERIFY_FAIL_EXIT_CODE)
      expect(result.stderr).toContain('skill bundle 容器内校验失败')
      await expect(readFile(agentSentinel, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await handle?.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
