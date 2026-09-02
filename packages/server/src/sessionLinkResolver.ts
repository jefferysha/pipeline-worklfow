import { join } from 'node:path'
import { listMemSessions, type MemFs, type StateStore } from '@tenon/kernel'
import { shQuote } from './serverSupport.js'

export async function resolveSessionLink(
  root: string,
  name: string,
  deps: { readonly store: StateStore; readonly memFs: MemFs },
): Promise<Record<string, unknown>> {
  const changeDir = join(root, 'openspec', 'changes', name)
  try {
    const wtRaw = await deps.store.get(changeDir, 'automation_worktree')
    const wt = Array.isArray(wtRaw) ? wtRaw.join(',') : (wtRaw ?? '')
    const lookupDir = wt !== '' && wt !== 'null' ? wt : root
    const claudeTop = listMemSessions(deps.memFs, { filter: { cwd: lookupDir, platform: 'claude', limit: 1 } })[0]
    const codexTop = listMemSessions(deps.memFs, { filter: { cwd: lookupDir, platform: 'codex', limit: 1 } })[0]
    const session = claudeTop && codexTop
      ? (codexTop.updated || codexTop.created || '') > (claudeTop.updated || claudeTop.created || '') ? codexTop : claudeTop
      : (claudeTop ?? codexTop ?? listMemSessions(deps.memFs, { filter: { cwd: lookupDir, platform: 'all', limit: 1 } })[0])
    if (!session) return { found: false, dir: lookupDir, reason: 'no-session' }
    const dir = session.cwd || lookupDir
    const resumeCmd = session.platform === 'claude'
      ? `cd ${shQuote(dir)} && claude --resume ${shQuote(session.id)}`
      : session.platform === 'codex'
        ? `cd ${shQuote(dir)} && codex resume ${shQuote(session.id)}`
        : null
    return {
      found: true,
      platform: session.platform,
      sessionId: session.id,
      dir,
      resumeCmd,
      ...(session.updated || session.created ? { mtime: session.updated || session.created } : {}),
    }
  } catch {
    return { found: false, dir: root, reason: 'lookup-error' }
  }
}
