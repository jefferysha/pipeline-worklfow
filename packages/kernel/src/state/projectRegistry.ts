/**
 * 机器级项目注册表 —— ~/.claude/pipeline-projects.json（JSON 字符串数组）读写模块
 * （v5 T2 决策 D：写下沉 kernel，init 自动登记 + server/dashboard 项目发现同源）。
 *
 * 读：老仓 project_model._read_registry 逐条对位——缺失/损坏/非数组 → []（best-effort，
 * 绝不阻断消费方；server registry.ts 复用本实现，容错语义零变化）。
 * 写：两侧 resolve 判重 + 同目录 tmp+rename 原子写（对齐 store.ts atomicWriteFile 先例）。
 * writer 本身 fail-loud；best-effort（失败仅 WARN、不影响 init exit 0）由 CLI 调用方兜
 * （对齐 history.ts 的职责切分）。路径由调用方注入（main.ts 传 homedir()，hermetic 测试
 * 传临时目录），kernel 不直接碰真实 HOME。
 */
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { withLock } from './lock.js'

export const PROJECT_REGISTRY_FILE = 'pipeline-projects.json'

/** 注册表缺省路径：<home>/.claude/pipeline-projects.json（老仓 project_model 同址） */
export function projectRegistryPath(home: string): string {
  return join(home, '.claude', PROJECT_REGISTRY_FILE)
}

/** 读注册表：缺失/损坏/非数组 → []；非字符串条目 String 强转（与 server 老实现逐字一致） */
export function readProjectRegistry(registryPath: string): string[] {
  try {
    const data: unknown = JSON.parse(readFileSync(registryPath, 'utf8'))
    return Array.isArray(data) ? data.map((x) => String(x)) : []
  } catch {
    return []
  }
}

let tmpSeq = 0

/**
 * 原子写注册表原语：mkdir -p + 同目录 tmp+rename（写入原子可见——崩溃不留半截 JSON）。
 * 序列化格式：JSON 数组 + 2 空格缩进 + 尾换行（保持人工可编辑；server projects.ts 复用同款，
 * 逐字节一致）。写失败抛错（fail-loud）。registerProjectRoot 与 server add/remove 共用本原语。
 */
export async function writeProjectRegistry(registryPath: string, roots: string[]): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true })
  const tmp = `${registryPath}.tmp.${process.pid}.${tmpSeq++}`
  await writeFile(tmp, `${JSON.stringify(roots, null, 2)}\n`, 'utf8')
  await rename(tmp, registryPath)
}

/**
 * 登记 repoRoot（resolve 后判重）：已存在 → 返回 false 且不写盘；写入 → 返回 true。
 * 注册表损坏时按空表处理（读容错），登记会将其修复为合法 JSON。写失败抛错（fail-loud）。
 *
 * read-modify-write 经 withLock 串行化（复用 store.ts/secrets.ts 同款文件锁 lock.ts::withLock）：
 * 两个并发 init 若不串行会各读同一旧表、后 rename 覆盖前者 → **丢注册**。锁在注册表所在目录
 * （~/.claude）上；withLock 的 acquire 用非递归 mkdir，故先确保该父目录存在（参照 secrets.ts::withSecretsLock）。
 */
export async function registerProjectRoot(registryPath: string, rawRoot: string): Promise<boolean> {
  const normalized = resolvePath(rawRoot)
  const dir = dirname(registryPath)
  await mkdir(dir, { recursive: true })
  return withLock(dir, async () => {
    const existing = readProjectRegistry(registryPath)
    if (existing.some((e) => e && resolvePath(e) === normalized)) return false
    await writeProjectRegistry(registryPath, [...existing, normalized])
    return true
  })
}
