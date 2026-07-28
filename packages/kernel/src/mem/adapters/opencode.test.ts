/**
 * mem/adapters/opencode —— 真 node:sqlite + 真临时 db 文件（G5 收编）。
 *
 * 与 claude/codex/pi 的 fakeFs()（内存文本 map）不同：OpenCode 落盘是二进制 SQLite，
 * DatabaseSync 只能开真实磁盘路径，无法套用纯文本 fakeFs。故这里用真 mkdtemp 临时目录
 * （对齐 kernel 内既有真 fs 测试惯例，如 channel/store.test.ts）+ node:sqlite 自己建一个
 * 真实、合法的 opencode.db，再喂给被测适配器真读——全程无 mock。
 *
 * schema 取自 2026-07 对 opencode-ai@1.17.14 的真实测（真跑 `opencode session list` 建库、
 * 真跑一条 `opencode run` 产生真会话、`sqlite3 .schema` 逐字核对），列裁到本适配器实际用到的
 * 子集（略去 cost/tokens/revert 等本适配器不读的列——省略不影响真实性，SELECT 语句不引用它们）。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { nodeMemFs } from '../fs.js'
import type { MemFs } from '../fs.js'
import type { MemFilter, MemSession } from '../types.js'
import { buildChildIndex } from '../sessions.js'
import { searchRelatedSessions } from '../relatedSearch.js'
import {
  opencodeExtractDialogue,
  opencodeListSessions,
  opencodeSearch,
  opencodeSqliteAvailable,
} from './opencode.js'

// node:sqlite 是极新的内建模块，Vite/vitest 的静态 import 解析目前不认得它（会当成裸包名
// "sqlite" 去找 node_modules，找不到就炸）——这也是产物代码 opencode.ts 不用静态 import、
// 改用 createRequire 惰性拿的实证原因之一。测试这里同样用 createRequire 绕开，而非改 vitest 配置。
type SqliteNS = typeof import('node:sqlite')
// 解构出来的 DatabaseSync 只是一个"值"绑定（构造函数）——destructuring 不会像
// `import { DatabaseSync } from ...` 那样连带把同名"类型"也带进这个作用域，故类型位置
// 另开 DatabaseSyncInstance（=实例类型）单独用，构造调用 `new DatabaseSync(...)` 仍用值绑定。
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as SqliteNS
type DatabaseSyncInstance = InstanceType<SqliteNS['DatabaseSync']>

let root: string
let fs: MemFs

/** env 全 undefined——不让真跑这套测试的宿主 shell 的 XDG_DATA_HOME 泄进来，保持临时目录隔离。 */
function realFs(home: string): MemFs {
  const base = nodeMemFs(home)
  return { ...base, env: () => undefined }
}

function dbFile(home: string): string {
  return join(home, '.local', 'share', 'opencode', 'opencode.db')
}

function filter(overrides: Partial<MemFilter> = {}): MemFilter {
  return { platform: 'opencode', since: null, until: null, cwd: null, limit: 50, ...overrides }
}

function createOpencodeSchema(db: DatabaseSyncInstance): void {
  db.exec(`
    CREATE TABLE session (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      workspace_id text,
      parent_id text,
      slug text NOT NULL,
      directory text NOT NULL,
      path text,
      title text NOT NULL,
      version text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL
    );
    CREATE TABLE message (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL,
      data text NOT NULL
    );
    CREATE TABLE part (
      id text PRIMARY KEY,
      message_id text NOT NULL,
      session_id text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL,
      data text NOT NULL
    );
  `)
}

async function openDbAt(path: string): Promise<DatabaseSyncInstance> {
  await mkdir(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  createOpencodeSchema(db)
  return db
}

async function openFixtureDb(home: string): Promise<DatabaseSyncInstance> {
  return openDbAt(dbFile(home))
}

function insertSession(
  db: DatabaseSyncInstance,
  row: { id: string; directory: string; title: string; parentId?: string | null; created: string; updated: string },
): void {
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    'global',
    row.parentId ?? null,
    'test-slug',
    row.directory,
    row.title,
    '1.17.14',
    Date.parse(row.created),
    Date.parse(row.updated),
  )
}

function insertMessage(db: DatabaseSyncInstance, opts: { id: string; sessionId: string; created: string; data: unknown }): void {
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    opts.id,
    opts.sessionId,
    Date.parse(opts.created),
    Date.parse(opts.created),
    JSON.stringify(opts.data),
  )
}

function insertPart(
  db: DatabaseSyncInstance,
  opts: { id: string; messageId: string; sessionId: string; created: string; data: unknown },
): void {
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(opts.id, opts.messageId, opts.sessionId, Date.parse(opts.created), Date.parse(opts.created), JSON.stringify(opts.data))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opencode-mem-'))
  fs = realFs(root)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('opencodeSqliteAvailable —— 本机 node:sqlite 探测', () => {
  test('本机 node>=22.5 且非降级环境 → true（该判断也是本文件其余真读能跑起来的前提）', () => {
    expect(opencodeSqliteAvailable()).toBe(true)
  })
})

describe('opencodeListSessions —— 真 SQLite session 表', () => {
  test('从未跑过 OpenCode（无 opencode.db）→ 空数组，不抛', () => {
    expect(opencodeListSessions(fs, filter())).toEqual([])
  })

  test('真读 session 行 → MemSession（cwd 取 directory 列，title/created/updated/filePath 齐全）', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, {
      id: 'ses_1',
      directory: '/home/u/work/proj',
      title: 'Fix login bug',
      created: '2026-07-05T10:00:00Z',
      updated: '2026-07-05T10:05:00Z',
    })
    db.close()

    const rows = opencodeListSessions(fs, filter())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      platform: 'opencode',
      id: 'ses_1',
      title: 'Fix login bug',
      cwd: '/home/u/work/proj',
      created: '2026-07-05T10:00:00.000Z',
      updated: '2026-07-05T10:05:00.000Z',
      parent_id: null,
    })
    expect(rows[0]?.filePath).toBe(dbFile(root))
  })

  test('parent_id 原样透出，且原生对接既有 buildChildIndex（sessions.ts 未改动）', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, {
      id: 'ses_parent',
      directory: '/home/u/work/proj',
      title: 'Parent task',
      created: '2026-07-05T10:00:00Z',
      updated: '2026-07-05T10:00:00Z',
    })
    insertSession(db, {
      id: 'ses_child',
      directory: '/home/u/work/proj',
      title: 'Child subtask',
      parentId: 'ses_parent',
      created: '2026-07-05T10:01:00Z',
      updated: '2026-07-05T10:02:00Z',
    })
    db.close()

    const rows = opencodeListSessions(fs, filter())
    const child = rows.find((r) => r.id === 'ses_child')
    expect(child?.parent_id).toBe('ses_parent')

    const idx = buildChildIndex(rows)
    expect(idx.get('ses_parent')?.map((s) => s.id)).toEqual(['ses_child'])
  })

  test('--cwd 过滤：精确匹配与子目录都保留，非同源目录剔除', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_a', directory: '/home/u/work/proj', title: 'A', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    insertSession(db, { id: 'ses_b', directory: '/home/u/work/proj/sub', title: 'B', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    insertSession(db, { id: 'ses_c', directory: '/home/u/other', title: 'C', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    db.close()

    const rows = opencodeListSessions(fs, filter({ cwd: '/home/u/work/proj' }))
    expect(rows.map((r) => r.id).sort()).toEqual(['ses_a', 'ses_b'])
  })

  test('since/until 按会话生命期重叠过滤', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_old', directory: '/p', title: 'old', created: '2026-01-01T00:00:00Z', updated: '2026-01-01T01:00:00Z' })
    insertSession(db, { id: 'ses_new', directory: '/p', title: 'new', created: '2026-07-05T00:00:00Z', updated: '2026-07-05T01:00:00Z' })
    db.close()

    const rows = opencodeListSessions(fs, filter({ since: Date.parse('2026-07-01T00:00:00Z') }))
    expect(rows.map((r) => r.id)).toEqual(['ses_new'])
  })

  test('directory 为空串（老仓遗留会话）→ cwd 忠实为 null，不当真路径处理', async () => {
    const db = await openFixtureDb(root)
    db.prepare(
      `INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
       VALUES (?, 'global', NULL, 's', '', 'legacy empty dir', '1.0.0', ?, ?)`,
    ).run('ses_legacy', Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-01T00:00:00Z'))
    db.close()

    const rows = opencodeListSessions(fs, filter())
    expect(rows[0]?.cwd).toBeNull()
  })
})

describe('OpenCode related search —— SQLite 内容预算 + descendants merge', () => {
  test('数据库存在但不可读时返回 partial warning，而不是完整空结果', async () => {
    await mkdir(dirname(dbFile(root)), { recursive: true })
    await writeFile(dbFile(root), 'not a sqlite database', 'utf8')

    const result = searchRelatedSessions(fs, {
      root: '/home/u/work/proj',
      query: 'project memory',
      platform: 'opencode',
    })

    expect(result.matches).toEqual([])
    expect(result.partial).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('opencode-reader-unavailable')
  })

  test('候选上限在项目过滤后生效，不被其他项目的更新会话挤出', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, {
      id: 'ses_target',
      directory: '/home/u/work/proj',
      title: 'Target project',
      created: '2026-07-01T10:00:00Z',
      updated: '2026-07-01T10:00:00Z',
    })
    insertMessage(db, {
      id: 'msg_target',
      sessionId: 'ses_target',
      created: '2026-07-01T10:00:01Z',
      data: { role: 'user' },
    })
    insertPart(db, {
      id: 'part_target',
      messageId: 'msg_target',
      sessionId: 'ses_target',
      created: '2026-07-01T10:00:01Z',
      data: { type: 'text', text: 'project scoped memory' },
    })
    for (let i = 0; i < 101; i += 1) {
      insertSession(db, {
        id: `ses_other_${i}`,
        directory: '/home/u/work/other',
        title: `Other ${i}`,
        created: '2026-07-02T10:00:00Z',
        updated: `2026-07-02T10:${String(i % 60).padStart(2, '0')}:00Z`,
      })
    }
    db.close()

    const result = searchRelatedSessions(fs, {
      root: '/home/u/work/proj',
      query: 'project memory',
      platform: 'opencode',
    })

    expect(result.matches).toEqual([
      expect.objectContaining({ sessionId: 'ses_target' }),
    ])
  })

  test('child user 命中合并到 parent，安全 DTO 只返回一个 parent 结果', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, {
      id: 'ses_parent',
      directory: '/home/u/work/proj',
      title: 'Parent task',
      created: '2026-07-05T10:00:00Z',
      updated: '2026-07-05T10:00:00Z',
    })
    insertSession(db, {
      id: 'ses_child',
      directory: '/home/u/work/proj',
      title: 'Child task',
      parentId: 'ses_parent',
      created: '2026-07-05T10:01:00Z',
      updated: '2026-07-05T10:02:00Z',
    })
    insertMessage(db, {
      id: 'msg_child',
      sessionId: 'ses_child',
      created: '2026-07-05T10:01:01Z',
      data: { role: 'user' },
    })
    insertPart(db, {
      id: 'part_child',
      messageId: 'msg_child',
      sessionId: 'ses_child',
      created: '2026-07-05T10:01:01Z',
      data: { type: 'text', text: 'related memory clue' },
    })
    db.close()

    const result = searchRelatedSessions(fs, {
      root: '/home/u/work/proj',
      query: 'memory clue',
      platform: 'opencode',
    })

    expect(result.partial).toBe(false)
    expect(result.matches).toEqual([
      expect.objectContaining({
        platform: 'opencode',
        sessionId: 'ses_parent',
        excerpt: 'related memory clue',
        descendantsMerged: 1,
      }),
    ])
    expect(result.matches[0]).not.toHaveProperty('cwd')
    expect(result.matches[0]).not.toHaveProperty('filePath')
  })
})

describe('opencodeExtractDialogue —— message+part 联表，只收 text part', () => {
  test('真实形态（对齐实测 opencode-ai@1.17.14 抓包）：跳过 step-start/reasoning/step-finish，只留 text', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, {
      id: 'msg_u1',
      sessionId: 'ses_1',
      created: '2026-07-05T10:00:01Z',
      data: { role: 'user', time: { created: 1 }, agent: 'build', model: { providerID: 'opencode', modelID: 'big-pickle' } },
    })
    insertPart(db, { id: 'prt_u1', messageId: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { type: 'text', text: 'please fix the login bug' } })

    insertMessage(db, {
      id: 'msg_a1',
      sessionId: 'ses_1',
      created: '2026-07-05T10:00:02Z',
      data: { role: 'assistant', parentID: 'msg_u1', mode: 'build', agent: 'build', modelID: 'big-pickle', providerID: 'opencode', finish: 'stop' },
    })
    insertPart(db, { id: 'prt_a1a', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:03Z', data: { type: 'step-start' } })
    insertPart(db, { id: 'prt_a1b', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:04Z', data: { type: 'reasoning', text: 'thinking it through', time: { start: 1 } } })
    insertPart(db, {
      id: 'prt_a1c',
      messageId: 'msg_a1',
      sessionId: 'ses_1',
      created: '2026-07-05T10:00:05Z',
      data: { type: 'text', text: 'Fixed the login bug by resetting the session token.' },
    })
    insertPart(db, { id: 'prt_a1d', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:06Z', data: { type: 'step-finish', reason: 'stop', tokens: {}, cost: 0 } })
    db.close()

    const session: MemSession = { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) }
    expect(opencodeExtractDialogue(fs, session)).toEqual([
      { role: 'user', text: 'please fix the login bug' },
      { role: 'assistant', text: 'Fixed the login bug by resetting the session token.' },
    ])
  })

  test('单条消息多个 text part 按序拼接（\\n\\n 连接，同 claude/pi 多 block 惯例）', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, { id: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'assistant' } })
    insertPart(db, { id: 'prt_1', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { type: 'text', text: 'Part one.' } })
    insertPart(db, { id: 'prt_2', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { type: 'text', text: 'Part two.' } })
    db.close()

    const turns = opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) })
    expect(turns).toEqual([{ role: 'assistant', text: 'Part one.\n\nPart two.' }])
  })

  test('compaction part（无 text 字段，边界折叠本轮诚实不做——见文件头注释）不产出 turn、不崩，兄弟消息仍正常出', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, { id: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'user' } })
    insertPart(db, { id: 'prt_c', messageId: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { type: 'compaction', auto: true } })
    insertMessage(db, { id: 'msg_u2', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { role: 'user' } })
    insertPart(db, { id: 'prt_2', messageId: 'msg_u2', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { type: 'text', text: 'continue please' } })
    db.close()

    const turns = opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) })
    expect(turns).toEqual([{ role: 'user', text: 'continue please' }])
  })

  test('未知/缺失 role 的消息整条丢弃', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, { id: 'msg_x', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'system-ish-unknown' } })
    insertPart(db, { id: 'prt_x', messageId: 'msg_x', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { type: 'text', text: 'should never show up' } })
    db.close()

    expect(opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) })).toEqual([])
  })

  test('注入标签清洗（复用 dialogue.ts stripInjectionTags，非重新发明）', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, { id: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'user' } })
    insertPart(db, {
      id: 'prt_1',
      messageId: 'msg_u1',
      sessionId: 'ses_1',
      created: '2026-07-05T10:00:01Z',
      data: { type: 'text', text: '<system-reminder>ignore this</system-reminder>actual question' },
    })
    db.close()

    const turns = opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) })
    expect(turns).toEqual([{ role: 'user', text: 'actual question' }])
  })

  test('bootstrap turn（超长 <INSTRUCTIONS> 块，originalLength>4000）整条丢弃（复用 dialogue.ts isBootstrapTurn）', async () => {
    // 注：用 AGENTS.md 前导做 fixture 会被 stripInjectionTags 自身的 AGENTS_RE 先行部分剥除
    // （短文本场景下，剥完就不再以该前缀开头，isBootstrapTurn 的 startsWith 分支反而不触发——
    // 这是 dialogue.ts 两个函数组合的真实行为，不是本适配器的 bug）。改用 dialogue.test.ts 里
    // 同款的 <INSTRUCTIONS> 超长块触发第二分支，两个函数都不会互相"吃掉"对方的判据。
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    const bigInstructions = '<INSTRUCTIONS>' + 'x'.repeat(4001)
    insertMessage(db, { id: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'user' } })
    insertPart(db, {
      id: 'prt_1',
      messageId: 'msg_u1',
      sessionId: 'ses_1',
      created: '2026-07-05T10:00:01Z',
      data: { type: 'text', text: bigInstructions },
    })
    insertMessage(db, { id: 'msg_u2', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { role: 'user' } })
    insertPart(db, { id: 'prt_2', messageId: 'msg_u2', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { type: 'text', text: 'the real first question' } })
    db.close()

    const turns = opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) })
    expect(turns).toEqual([{ role: 'user', text: 'the real first question' }])
  })

  test('会话无消息 → 空数组', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_empty', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    db.close()

    expect(opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_empty', filePath: dbFile(root) })).toEqual([])
  })

  test('会话 id 在 db 中不存在 → 空数组（不是抛错）', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    db.close()

    expect(opencodeExtractDialogue(fs, { platform: 'opencode', id: 'ses_nonexistent', filePath: dbFile(root) })).toEqual([])
  })
})

describe('opencodeSearch —— 3 参数真检索 + 老 1 参数签名向后兼容', () => {
  test('老 1 参数签名保持 no-op（sessions.ts 调用点尚未接线到 3 参数前的兼容态——见文件头注释②）', () => {
    expect(opencodeSearch('anything')).toEqual({ count: 0, userCount: 0, asstCount: 0, totalTurns: 0, excerpts: [] })
  })

  test('新 3 参数签名：真过 message/part 检索命中', async () => {
    const db = await openFixtureDb(root)
    insertSession(db, { id: 'ses_1', directory: '/p', title: 't', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:10Z' })
    insertMessage(db, { id: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { role: 'user' } })
    insertPart(db, { id: 'prt_1', messageId: 'msg_u1', sessionId: 'ses_1', created: '2026-07-05T10:00:01Z', data: { type: 'text', text: 'please fix the login bug' } })
    insertMessage(db, { id: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { role: 'assistant' } })
    insertPart(db, { id: 'prt_2', messageId: 'msg_a1', sessionId: 'ses_1', created: '2026-07-05T10:00:02Z', data: { type: 'text', text: 'unrelated reply' } })
    db.close()

    const session: MemSession = { platform: 'opencode', id: 'ses_1', filePath: dbFile(root) }
    const hit = opencodeSearch(fs, session, 'login bug')
    // count/userCount/asstCount 是 turn 内全部 token 出现总数（search.ts docstring），非"匹配 turn 数"：
    // 'login'×1 + 'bug'×1 出现在同一条 user turn 里 → userCount=2；assistant turn 不含任一 token，剔除在外。
    expect(hit.userCount).toBe(2)
    expect(hit.asstCount).toBe(0)
    expect(hit.count).toBe(2)

    const miss = opencodeSearch(fs, session, 'nothing matches this')
    expect(miss.count).toBe(0)
  })
})

describe('XDG_DATA_HOME override —— fs.env 注入生效', () => {
  test('设置 XDG_DATA_HOME 时，db 路径落在该目录而非 <home>/.local/share', async () => {
    const customDataHome = join(root, 'custom-xdg-data')
    const customFs: MemFs = { ...fs, env: (name) => (name === 'XDG_DATA_HOME' ? customDataHome : undefined) }

    const db = await openDbAt(join(customDataHome, 'opencode', 'opencode.db'))
    insertSession(db, { id: 'ses_custom', directory: '/p', title: 'via XDG override', created: '2026-07-05T10:00:00Z', updated: '2026-07-05T10:00:00Z' })
    db.close()

    expect(opencodeListSessions(customFs, filter())).toHaveLength(1)
    // 默认 <home>/.local/share 路径下没有文件——默认 fs（env 全 undefined）读不到，证明两条路径没有串。
    expect(opencodeListSessions(fs, filter())).toEqual([])
  })
})

describe('honest fallback —— sqlite 打不开时静默降级，绝不抛（诚实门）', () => {
  test('db 路径存在但不是合法 sqlite 文件 → listSessions/extractDialogue 都返回空而非抛', async () => {
    const path = dbFile(root)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, 'this is not a real sqlite file, just plain text bytes')

    expect(() => opencodeListSessions(fs, filter())).not.toThrow()
    expect(opencodeListSessions(fs, filter())).toEqual([])

    const fakeSession: MemSession = { platform: 'opencode', id: 'whatever', filePath: path }
    expect(() => opencodeExtractDialogue(fs, fakeSession)).not.toThrow()
    expect(opencodeExtractDialogue(fs, fakeSession)).toEqual([])
  })
})
