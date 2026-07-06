/**
 * git 双挂载解析（BACKLOG #29c，DESIGN §4.5 + §7）—— 移植老仓 lifecycle/gitMounts.ts:44-85。
 *
 * 双挂载不变量（ROUND-3 核心）：worktree 的 `.git` 不是仓库，是一行指针文件
 *   `gitdir: <hostRepo>/.git/worktrees/<name>`
 * 只挂那个文件 → 容器内 git 跟着 gitdir: 找到一个容器里不存在的路径 → worktree 完全不可用。
 * 故**同时挂** `.git` 文件 AND 父 `.git` 目录，各 `sandboxPath === hostPath`：gitdir: 持 host
 * 绝对路径，只有挂到同一绝对路径指针才在容器内解析。`parentGitDir` = gitdir 路径上跳恰两级
 * （worktrees/<name> → worktrees → .git），不是一级。
 *
 * 纯函数（stat/readFile 注入面），可穷举单测；真 fs 走生产 default deps。
 */
import { readFile as fsReadFile, stat as fsStat } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface GitMount {
  readonly hostPath: string
  readonly sandboxPath: string
}

interface GitMountsDeps {
  stat?: (p: string) => Promise<{ isDirectory(): boolean }>
  readFile?: (p: string) => Promise<string>
}

/**
 * 解析 worktree `.git`（gitPath）的 git 相关挂载：
 *  - `.git` 是目录（普通 clone）→ 单挂载 host==sandbox。
 *  - `.git` 是文件（worktree 指针）→ 双挂载：`.git` 文件 + 父 `.git` 目录，各 host==sandbox。
 *  - 无法识别的文件内容 → 回退按原样挂文件。
 */
export const resolveGitMounts = async (gitPath: string, deps?: GitMountsDeps): Promise<GitMount[]> => {
  const stat = deps?.stat ?? ((p: string) => fsStat(p))
  const readFile = deps?.readFile ?? ((p: string) => fsReadFile(p, 'utf-8'))

  const s = await stat(gitPath)
  if (s.isDirectory()) {
    return [{ hostPath: gitPath, sandboxPath: gitPath }]
  }
  const content = (await readFile(gitPath)).trim()
  const match = content.match(/^gitdir:\s*(.+)$/)
  if (!match) {
    return [{ hostPath: gitPath, sandboxPath: gitPath }]
  }
  const gitdirPath = match[1]!
  // gitdirPath 形如 /repo/.git/worktrees/<name>；上跳两级到父 .git 目录。
  const parentGitDir = resolve(gitdirPath, '..', '..')
  return [
    { hostPath: gitPath, sandboxPath: gitPath },
    { hostPath: parentGitDir, sandboxPath: parentGitDir },
  ]
}

/** 拆 `gitdir:` 路径为父 .git 目录 + worktree 名（同时吃 `/` 与 `\`）。 */
export const parseGitdirPath = (gitdirPath: string): { parentGitDir: string; worktreeName: string } => {
  const normalized = gitdirPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  const worktreeName = segments.pop()!
  segments.pop() // "worktrees"
  const parentGitDir = segments.join('/')
  return { worktreeName, parentGitDir }
}
