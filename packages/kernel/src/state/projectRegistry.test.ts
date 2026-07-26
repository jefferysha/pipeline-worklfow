import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  readProjectRegistry,
  registerProjectRoot,
  unregisterProjectRoot,
  writeProjectRegistry,
} from './projectRegistry.js'

describe('projectRegistry —— Tenon 配置域项目注册表读写', () => {
  let configRoot: string
  let registry: string
  beforeEach(async () => {
    configRoot = await mkdtemp(join(tmpdir(), 'tenon-projreg-'))
    registry = join(configRoot, 'projects.json')
  })
  afterEach(async () => {
    // 不可写用例会把目录改成只读，先恢复权限再删
    await chmod(configRoot, 0o755).catch(() => {})
    await rm(configRoot, { recursive: true, force: true })
  })

  test('projectRegistryPath = <Tenon config root>/projects.json', () => {
    expect(registry).toBe(join(configRoot, 'projects.json'))
  })

  describe('readProjectRegistry —— 容错语义与 server registry.ts 逐条对位', () => {
    test('合法 JSON 字符串数组 → 原样返回', async () => {
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, JSON.stringify(['/a', '/b']), 'utf8')
      expect(readProjectRegistry(registry)).toEqual(['/a', '/b'])
    })
    test('文件缺失 → []', () => {
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('损坏 JSON → []', async () => {
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, '{oops', 'utf8')
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('非数组 JSON → []', async () => {
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, '{"a":1}', 'utf8')
      expect(readProjectRegistry(registry)).toEqual([])
    })
    test('数组内非字符串条目 → String 强转（老实现同款）', async () => {
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, '["/a", 42]', 'utf8')
      expect(readProjectRegistry(registry)).toEqual(['/a', '42'])
    })
  })

  describe('writeProjectRegistry —— 原子写原语（mkdir -p + tmp+rename，逐字节格式）', () => {
    test('逐字节格式：JSON 数组 + 2 空格缩进 + 尾换行（与 server projects.ts 现状同款）', async () => {
      await writeProjectRegistry(registry, ['/a', '/b'])
      const raw = await readFile(registry, 'utf8')
      expect(raw).toBe(`${JSON.stringify(['/a', '/b'], null, 2)}\n`)
    })

    test('mkdir -p：目标配置目录不存在时自动创建', async () => {
      await writeProjectRegistry(registry, ['/x'])
      expect(JSON.parse(await readFile(registry, 'utf8'))).toEqual(['/x'])
    })

    test('空数组 → "[]\\n"（server remove 清空注册表的逐字节语义）', async () => {
      await writeProjectRegistry(registry, [])
      expect(await readFile(registry, 'utf8')).toBe('[]\n')
    })

    test('原子写：写后同目录无 *.tmp* 残留（tmp+rename 同目录）', async () => {
      await writeProjectRegistry(registry, ['/a'])
      await writeProjectRegistry(registry, ['/a', '/b'])
      const entries = await readdir(configRoot)
      expect(entries).toEqual(['projects.json'])
    })
  })

  describe('registerProjectRoot —— resolve 去重 + 原子写', () => {
    test('首次登记：自动建配置目录，JSON 含 resolve 后 root，返回 true', async () => {
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
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, '{oops', 'utf8')
      expect(await registerProjectRoot(registry, '/repo/demo')).toBe(true)
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(data).toEqual(['/repo/demo'])
    })

    test('既有条目保留：追加不覆盖别的项目', async () => {
      await mkdir(configRoot, { recursive: true })
      await writeFile(registry, JSON.stringify(['/existing']), 'utf8')
      await registerProjectRoot(registry, '/repo/new')
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(data).toEqual(['/existing', '/repo/new'])
    })

    test('原子写：写后目录里无 *.tmp* 残留（tmp+rename 同目录）', async () => {
      await registerProjectRoot(registry, '/repo/a')
      await registerProjectRoot(registry, '/repo/b')
      const entries = await readdir(configRoot)
      expect(entries).toEqual(['projects.json'])
    })

    test('目录不可写 → 抛错（fail-loud；best-effort 由 CLI 调用方兜，对齐 history.ts 职责切分）', async () => {
      await mkdir(configRoot, { recursive: true })
      await chmod(configRoot, 0o555)
      await expect(registerProjectRoot(registry, '/repo/x')).rejects.toThrow()
    })

    test('B3：两并发登记不同 root 不丢注册（withLock 串行化 read-modify-write，非无锁 last-write-wins）', async () => {
      await Promise.all([
        registerProjectRoot(registry, '/repo/concurrent-a'),
        registerProjectRoot(registry, '/repo/concurrent-b'),
      ])
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(data).toContain(resolvePath('/repo/concurrent-a'))
      expect(data).toContain(resolvePath('/repo/concurrent-b'))
      expect(data).toHaveLength(2)
    })

    test('B3：多并发登记（含重复）→ 去重且零丢失（最终恰为去重后的全集）', async () => {
      await Promise.all([
        registerProjectRoot(registry, '/repo/x'),
        registerProjectRoot(registry, '/repo/y'),
        registerProjectRoot(registry, '/repo/x'), // 重复
        registerProjectRoot(registry, '/repo/z'),
      ])
      const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
      expect(new Set(data)).toEqual(new Set([resolvePath('/repo/x'), resolvePath('/repo/y'), resolvePath('/repo/z')]))
      expect(data).toHaveLength(3)
    })
  })

  describe('unregisterProjectRoot —— 与 register 共用唯一锁内事务', () => {
    test('删除存在的规范化 root 返回 true；不存在时返回 false', async () => {
      await writeProjectRegistry(registry, ['/repo/keep', '/repo/remove'])
      expect(await unregisterProjectRoot(registry, '/repo/remove/')).toBe(true)
      expect(await unregisterProjectRoot(registry, '/repo/remove')).toBe(false)
      expect(readProjectRegistry(registry)).toEqual(['/repo/keep'])
    })

    test('并发新增与删除不会丢新增或复活已删除 root', async () => {
      const oldRoots = Array.from({ length: 20 }, (_, index) => `/repo/old-${index}`)
      const newRoots = Array.from({ length: 20 }, (_, index) => `/repo/new-${index}`)
      await writeProjectRegistry(registry, oldRoots)

      await Promise.all([
        ...oldRoots.map((root) => unregisterProjectRoot(registry, root)),
        ...newRoots.map((root) => registerProjectRoot(registry, root)),
      ])

      expect(new Set(readProjectRegistry(registry))).toEqual(
        new Set(newRoots.map((root) => resolvePath(root))),
      )
    })
  })
})
