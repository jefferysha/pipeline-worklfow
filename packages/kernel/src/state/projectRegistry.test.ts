import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { projectRegistryPath, readProjectRegistry, registerProjectRoot } from './projectRegistry.js'

describe('projectRegistry —— 机器级项目注册表读写（v5 T2 决策 D，hermetic 临时 HOME）', () => {
  let home: string
  let registry: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'lite-projreg-'))
    registry = projectRegistryPath(home)
  })
  afterEach(async () => {
    // 不可写用例会把目录改成只读，先恢复权限再删
    await chmod(join(home, '.claude'), 0o755).catch(() => {})
    await rm(home, { recursive: true, force: true })
  })

  test('projectRegistryPath = <home>/.claude/pipeline-projects.json（老仓 project_model 同址）', () => {
    expect(registry).toBe(join(home, '.claude', 'pipeline-projects.json'))
  })

  describe('readProjectRegistry —— 容错语义与 server registry.ts 逐条对位', () => {
    test('合法 JSON 字符串数组 → 原样返回', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, JSON.stringify(['/a', '/b']), 'utf8')
      expect(readProjectRegistry(registry)).toEqual(['/a', '/b'])
    })
    test('文件缺失 → []', () => {
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('损坏 JSON → []', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, '{oops', 'utf8')
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('非数组 JSON → []', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, '{"a":1}', 'utf8')
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('数组内非字符串条目 → String 强转（老实现同款）', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, '["/a", 42]', 'utf8')
      expect(readProjectRegistry(registry)).toEqual(['/a', '42'])
    })
  })

  describe('registerProjectRoot —— resolve 去重 + 原子写', () => {
    test('首次登记：自动建 .claude 目录，JSON 含 resolve 后 root，返回 true', async () => {
      const root = await mkdtemp(join(tmpdir(), 'lite-projroot-'))
      try {
        expect(await registerProjectRoot(registry, root)).toBe(true)
        const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
        expect(data).toEqual([resolvePath(root)])
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })

    test('重复登记（含未规范化路径变体）→ 不写盘、返回 false，条目不重复', async () => {
      const root = await mkdtemp(join(tmpdir(), 'lite-projroot-'))
      try {
        await registerProjectRoot(registry, root)
        expect(await registerProjectRoot(registry, root)).toBe(false)
        // 尾随斜杠 / 冗余段的变体也要判重（两侧 resolve 再比较）
        expect(await registerProjectRoot(registry, `${root}/`)).toBe(false)
        expect(await registerProjectRoot(registry, join(root, 'x', '..'))).toBe(false)
        const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
        expect(data).toEqual([resolvePath(root)])
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })

    test('注册表损坏 → 按空表处理（读容错），登记后文件恢复为合法 JSON', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, '{oops', 'utf8')
      expect(await registerProjectRoot(registry, '/repo/demo')).toBe(true)
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(data).toEqual(['/repo/demo'])
    })

    test('既有条目保留：追加不覆盖别的项目', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(registry, JSON.stringify(['/existing']), 'utf8')
      await registerProjectRoot(registry, '/repo/new')
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(data).toEqual(['/existing', '/repo/new'])
    })

    test('原子写：写后目录里无 *.tmp* 残留（tmp+rename 同目录）', async () => {
      await registerProjectRoot(registry, '/repo/a')
      await registerProjectRoot(registry, '/repo/b')
      const entries = await readdir(join(home, '.claude'))
      expect(entries).toEqual(['pipeline-projects.json'])
    })

    test('目录不可写 → 抛错（fail-loud；best-effort 由 CLI 调用方兜，对齐 history.ts 职责切分）', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await chmod(join(home, '.claude'), 0o555)
      await expect(registerProjectRoot(registry, '/repo/x')).rejects.toThrow()
    })
  })
})
