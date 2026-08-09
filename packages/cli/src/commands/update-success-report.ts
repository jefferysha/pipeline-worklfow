import type { CliDeps } from '../deps.js'
import type { RuntimeActivation } from '../runtime/types.js'
import { printCodexAuthGuidance, renderDeferredCodexAuthLine } from '../codexAuth.js'
import type { SetupEnv } from './setup.js'
import { hostFlag, type NativePipelineHost } from './plugin-host.js'
import { reportRegisteredProjects } from './update-project-report.js'

export async function reportSuccessfulNativeUpdate(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  hostExecutable: string,
  activation: RuntimeActivation,
  readyPort: number,
  auto: boolean,
): Promise<number> {
  deps.io.out(
    `[update] 已原子切换至已验证 runtime: ${activation.release.releaseId}`
    + `（revision ${activation.selection.revision}）。`,
  )
  if (auto) {
    deps.io.out(`[update] ${hostFlag(host)} 已在后台刷新；当前会话继续使用已加载版本，新会话将加载新 skills/hooks。`)
  } else {
    deps.io.out(`[update] ${hostFlag(host)} 已更新；稳定 tenon launcher 已保持不变，新会话将加载新 skills/hooks。`)
  }
  if (host === 'codex') {
    deps.io.out('[update] 若 Codex 将新版本 Tenon hook 标为未信任或已变更，请在 Codex 输入 /hooks 后重新信任；这是宿主的安全边界。')
    if (auto) {
      deps.io.out(renderDeferredCodexAuthLine('后台更新未检查登录状态'))
    } else {
      const auth = await env.codexAuthStatus(hostExecutable)
        .catch(() => ({ state: 'unavailable', reason: 'spawn-error' } as const))
      printCodexAuthGuidance(deps.io, auth)
    }
  }
  reportRegisteredProjects(deps, env, activation.release.source.pluginVersion)
  deps.io.out(`[dashboard] 已就绪：http://127.0.0.1:${readyPort}/；如需打开：tenon dashboard --open`)
  return 0
}
