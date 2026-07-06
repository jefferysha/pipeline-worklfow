/**
 * 机器级路径锚。默认 home = ~ ；可经 PIPELINE_DASHBOARD_HOME 覆盖（仅供 hermetic 测试隔离，
 * 生产不设即原行为——对齐老仓 dashboard-server.py 的 PIPELINE_DASHBOARD_HOME 语义）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ServerPaths } from './types.js'

export function resolveServerPaths(opts?: { home?: string }): ServerPaths {
  const home = opts?.home ?? process.env.PIPELINE_DASHBOARD_HOME ?? homedir()
  const claudeDir = join(home, '.claude')
  return {
    home,
    claudeDir,
    registryPath: join(claudeDir, 'pipeline-projects.json'),
    tokenPath: join(claudeDir, '.pipeline-dashboard-token'),
    pidfilePath: join(claudeDir, '.pipeline-dashboard.server'),
  }
}
