import type { CliDeps } from '../deps.js'
import type { PipelineHost } from './plugin-host.js'

export type HostBoundaryState = 'in-progress' | 'committed'
export type ManagedBoundaryState = 'unchanged' | 'restored' | 'indeterminate'

export function boundaryDetail(
  hostState: HostBoundaryState,
  managedState: ManagedBoundaryState,
  detail: string,
): string {
  return `host=${hostState}; managed=${managedState}; ${detail}`
}

export function reportHostBoundary(deps: CliDeps, host: PipelineHost, state: HostBoundaryState): void {
  if (state === 'committed') {
    deps.io.err(
      `[update] 宿主插件缓存已由 ${host === 'codex' ? 'Codex' : 'Claude'} 更新；`
      + 'Tenon 未回滚宿主私有缓存，当前会话仍使用其已加载版本。',
    )
    return
  }
  deps.io.err(
    `[update] --${host} 宿主更新在 inventory 提交确认前失败；`
    + '宿主私有缓存状态由宿主 CLI 管理，Tenon 未直接写入或恢复该缓存。',
  )
}
