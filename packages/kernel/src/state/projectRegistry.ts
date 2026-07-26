/**
 * Tenon 配置域项目注册表（JSON 字符串数组）读写模块。
 * 路径由 resolveProductPaths().registryPath 统一给出；init 与 Dashboard 消费同一文件。
 *
 * 读：老仓 project_model._read_registry 逐条对位——缺失/损坏/非数组 → []（best-effort，
 * 绝不阻断消费方；server registry.ts 复用本实现，容错语义零变化）。
 * 写：两侧 resolve 判重 + 同目录 tmp+rename 原子写（对齐 store.ts atomicWriteFile 先例）。
 * writer 本身 fail-loud；best-effort（失败仅 WARN、不影响 init exit 0）由 CLI 调用方兜
 * （对齐 history.ts 的职责切分）。路径由调用方注入（main.ts 传 homedir()，hermetic 测试
 * 传临时目录），本模块不自行推断宿主目录。
 */
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { withLock } from './lock.js'

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
 * 锁内原子写注册表原语：mkdir -p + 同目录 tmp+rename（写入原子可见——崩溃不留半截 JSON）。
 * 序列化格式：JSON 数组 + 2 空格缩进 + 尾换行（保持人工可编辑；server projects.ts 复用同款，
 * 逐字节一致）。写失败抛错（fail-loud）。所有公开 writer 共用 config-dir 锁；锁内 RMW 使用
 * 私有 unlocked writer，避免嵌套抢同一把锁。
 */
async function writeProjectRegistryUnlocked(registryPath: string, roots: readonly string[]): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true })
  const tmp = `${registryPath}.tmp.${process.pid}.${tmpSeq++}`
  await writeFile(tmp, `${JSON.stringify(roots, null, 2)}\n`, 'utf8')
  await rename(tmp, registryPath)
}

async function withProjectRegistryLock<T>(
  registryPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const dir = dirname(registryPath)
  await mkdir(dir, { recursive: true })
  return withLock(dir, operation)
}

export async function writeProjectRegistry(registryPath: string, roots: string[]): Promise<void> {
  await withProjectRegistryLock(
    registryPath,
    async () => writeProjectRegistryUnlocked(registryPath, roots),
  )
}

/**
 * 登记 repoRoot（resolve 后判重）：已存在 → 返回 false 且不写盘；写入 → 返回 true。
 * 注册表损坏时按空表处理（读容错），登记会将其修复为合法 JSON。写失败抛错（fail-loud）。
 *
 * read-modify-write 经 withLock 串行化（复用 store.ts/secrets.ts 同款文件锁 lock.ts::withLock）：
 * 两个并发 init 若不串行会各读同一旧表、后 rename 覆盖前者 → **丢注册**。锁在注册表所在目录
 * （Tenon config root）上；withLock 的 acquire 用非递归 mkdir，故先确保该父目录存在。
 */
export async function registerProjectRoot(registryPath: string, rawRoot: string): Promise<boolean> {
  const normalized = resolvePath(rawRoot)
  return withProjectRegistryLock(registryPath, async () => {
    const existing = readProjectRegistry(registryPath)
    if (existing.some((e) => e && resolvePath(e) === normalized)) return false
    await writeProjectRegistryUnlocked(registryPath, [...existing, normalized])
    return true
  })
}

/**
 * 注销 repoRoot（resolve 后比较）：存在时在同一 config-dir 锁内删除并返回 true；不存在返回 false。
 * 与 registerProjectRoot 共用唯一事务边界，Dashboard、CLI 与迁移并发时不会发生无锁 last-write-wins。
 */
export async function unregisterProjectRoot(registryPath: string, rawRoot: string): Promise<boolean> {
  const normalized = resolvePath(rawRoot)
  return withProjectRegistryLock(registryPath, async () => {
    const existing = readProjectRegistry(registryPath)
    const next = existing.filter((entry) => !entry || resolvePath(entry) !== normalized)
    if (next.length === existing.length) return false
    await writeProjectRegistryUnlocked(registryPath, next)
    return true
  })
}
