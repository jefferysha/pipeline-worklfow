import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  createTransitionRecordStore, InvalidRecordIdentityError, RecordAlreadyExistsError, TRANSITION_RECORDS_DIR,
} from './transition-record-store.js'
import type { TransitionRecord } from '../workflow/run-types.js'

const dirs: string[] = []
async function freshChangeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'pl-run-record-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

function record(overrides: Partial<TransitionRecord> = {}): TransitionRecord {
  return {
    schemaVersion: 1,
    id: 'rec-1',
    runId: 'run-1',
    sequence: 1,
    workflowId: 'default',
    event: 'open-complete',
    from: 'open',
    to: 'explore',
    effects: [{ kind: 'state-field-change', field: 'phase', from: 'open', to: 'explore' }],
    observedAt: '2026-07-16T00:00:00Z',
    ...overrides,
  }
}

describe('TransitionRecordStore.write —— 不可变记录真实原子落盘', () => {
  test('写入后文件真实存在于 .pipeline-transitions/<sequence 零填充>-<id>.json', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await store.write(dir, record())
    const files = await readdir(join(dir, TRANSITION_RECORDS_DIR))
    expect(files).toEqual(['000001-rec-1.json'])
  })

  test('写入内容是逐字段完整的 JSON（不是部分序列化）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const rec = record({ actor: 'agent' })
    await store.write(dir, rec)
    const raw = await readFile(join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual(rec)
  })

  test('同 sequence+id 二次写入 → 拒绝覆盖，抛 RecordAlreadyExistsError（不可变由存储层强制，' +
    '不是靠调用方自律——W1 第二增量第三轮 codex review 抓到：旧实现用 rename 会静默覆盖同名目标）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await store.write(dir, record({ event: 'open-complete' }))
    await expect(store.write(dir, record({ event: 'tampered' }))).rejects.toThrow(RecordAlreadyExistsError)
    // 第一次写入的内容必须原样保留，没有被第二次写入篡改
    const raw = await readFile(join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json'), 'utf8')
    expect((JSON.parse(raw) as { event: string }).event).toBe('open-complete')
  })

  test('record.id 含路径分隔符/上级目录穿越 → 拒绝，抛 InvalidRecordIdentityError（W1 第二增量' +
    '第五轮 codex review 要求：不依赖"调用方永远诚实"，路径安全在存储层强制）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await expect(store.write(dir, record({ id: '../../etc/passwd' }))).rejects.toThrow(InvalidRecordIdentityError)
    await expect(store.write(dir, record({ id: 'a/b' }))).rejects.toThrow(InvalidRecordIdentityError)
  })

  test('sequence 非正整数（0/负数/小数） → 拒绝，抛 InvalidRecordIdentityError', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await expect(store.write(dir, record({ sequence: 0 }))).rejects.toThrow(InvalidRecordIdentityError)
    await expect(store.write(dir, record({ sequence: -1 }))).rejects.toThrow(InvalidRecordIdentityError)
    await expect(store.write(dir, record({ sequence: 1.5 }))).rejects.toThrow(InvalidRecordIdentityError)
  })

  test('sequence 用零填充保序（10 前面不会因字符串序排到 2 前面）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await store.write(dir, record({ id: 'rec-2', sequence: 2 }))
    await store.write(dir, record({ id: 'rec-10', sequence: 10 }))
    const files = (await readdir(join(dir, TRANSITION_RECORDS_DIR))).sort()
    expect(files.indexOf('000002-rec-2.json')).toBeLessThan(files.indexOf('000010-rec-10.json'))
  })
})

describe('TransitionRecordStore.read —— 按 sequence+id 精确读取', () => {
  test('读回刚写入的记录', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await store.write(dir, record())
    expect(await store.read(dir, 1, 'rec-1')).toEqual(record())
  })

  test('不存在的记录 → undefined（不抛错，诊断读容忍缺失）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    expect(await store.read(dir, 99, 'nope')).toBeUndefined()
  })
})

describe('TransitionRecordStore.readChain —— 沿 previousRecordId 单向链回溯', () => {
  test('三条连续记录：从最新 head 回溯，返回按 sequence 升序的完整链', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1, from: 'open', to: 'explore' })
    const r2 = record({ id: 'rec-2', sequence: 2, from: 'explore', to: 'spec', previousRecordId: 'rec-1' })
    const r3 = record({ id: 'rec-3', sequence: 3, from: 'spec', to: 'build', previousRecordId: 'rec-2' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    await store.write(dir, r3)
    const chain = await store.readChain(dir, 3, 'rec-3', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-1', 'rec-2', 'rec-3'])
  })

  test('单条记录（第一条转换，没有 previous）→ 链长 1', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    await store.write(dir, record())
    const chain = await store.readChain(dir, 1, 'rec-1', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-1'])
  })

  test('孤儿记录（已写入但从未被任何 head 引用）不出现在从真实 head 出发的链里——' +
    'record 写了但 rename 失败场景的核心断言：head 不指向它，它就是不可达孤儿', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1 })
    // rec-orphan 独立写入、sequence 也用了 2，但从未被任何后续记录的 previousRecordId 引用，
    // 也从未被当作 head 传给 readChain——模拟「记录文件已原子写入，但 YAML rename 提交失败」
    const rOrphan = record({ id: 'rec-orphan', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r1)
    await store.write(dir, rOrphan)
    // 真实提交链其实还停在 rec-1（YAML 从未 rename 到指向 rec-orphan）
    const chain = await store.readChain(dir, 1, 'rec-1', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-1'])
    expect(chain.map((r) => r.id)).not.toContain('rec-orphan')
  })

  test('链在中途断裂（祖先文件缺失，理论上不该发生）→ 从断点截止，不抛错', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    // 只写 rec-2，不写它声称依赖的 rec-1（模拟磁盘损坏/手工删除的极端场景）
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r2)
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  // 以下 5 个用例对应 codex 架构 review P2：readChain 曾经完全信任 JSON 文件内容，不做任何
  // 完整性校验——损坏/手工篡改的记录文件可能产出错误顺序的链、甚至因 previousRecordId 成环
  // 而死循环。修复原则统一是「链在此断裂」：当作不可信节点处理，等同于记录缺失，break 不抛错、
  // 不把不可信节点计入结果。

  test('祖先记录的 id 字段被篡改（跟文件名不符）→ 链在该节点处截断，不含被篡改记录，不抛错', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1 })
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    // 文件名仍是 000001-rec-1.json，但内容里的 id 被改成跟文件名不一致的值——模拟磁盘篡改。
    const path = join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json')
    const tampered = { ...(JSON.parse(await readFile(path, 'utf8')) as TransitionRecord), id: 'rec-1-tampered' }
    await writeFile(path, JSON.stringify(tampered), 'utf8')
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  test('祖先记录的 sequence 字段被篡改（跟文件名不符）→ 链在该节点处截断，不含被篡改记录，不抛错', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1 })
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    // 文件名仍是 000001-rec-1.json，但内容里的 sequence 被改成跟文件名不一致的值。
    const path = join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json')
    const tampered = { ...(JSON.parse(await readFile(path, 'utf8')) as TransitionRecord), sequence: 5 }
    await writeFile(path, JSON.stringify(tampered), 'utf8')
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  test('祖先记录的 runId 跟调用方传入的 expectedRunId 不一致 → 链在该节点处截断（诊断读时发现' +
    '"混入了别的 run 的记录"——权威来自调用方外部传入的 expectedRunId，不是链首自证，见下面' +
    '"整条链被替换成另一个 run"用例）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    // rec-1 真实 runId 是 run-a；rec-2（head）自称 previousRecordId 指向 rec-1，自己是 run-b。
    // 调用方传入的 expectedRunId 是 'run-b'（模拟外部权威值——即 .pipeline.yaml runMetadata.runId
    // ——恰好等于 head 声称的值）：rec-1 跟 expectedRunId 不一致，回溯到 rec-1 时截断。
    const r1 = record({ id: 'rec-1', sequence: 1, runId: 'run-a' })
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1', runId: 'run-b' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-b')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  test('previousRecordId 形成两节点环 → 不死循环、不抛错，返回不重复的有限前缀（W1 codex review ' +
    'P2：未加防护时不是真正的无限循环——rec-a/rec-b 各自的 id/sequence 都跟自己的文件名一致，' +
    '所以不会被 id/sequence 校验拦下；问题在于沿 previousRecordId 走完 rec-a→rec-b 后会算出' +
    'sequence=0 再去请求，而 read() 对非正整数 sequence 会抛 InvalidRecordIdentityError——已读' +
    '代码确认这是有限步（2 步）内必然抛错，不是挂起，因此直接断言即可，不需要额外超时兜底；' +
    '加了 headSequence 步数上限后，会在发起那次非法读取之前就 break，不再抛错）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const rA = record({ id: 'rec-a', sequence: 2, previousRecordId: 'rec-b' })
    const rB = record({ id: 'rec-b', sequence: 1, previousRecordId: 'rec-a' })
    await store.write(dir, rA)
    await store.write(dir, rB)
    const chain = await store.readChain(dir, 2, 'rec-a', 'run-1')
    const ids = chain.map((r) => r.id)
    expect(ids).toEqual(['rec-b', 'rec-a'])
    expect(new Set(ids).size).toBe(ids.length) // 不重复，防环生效
  }, 5000)

  test('健康的 4 步链（真实 write() 写出，不手工改内容）→ 四层防御性校验零影响，完整返回', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1, from: 'open', to: 'explore' })
    const r2 = record({ id: 'rec-2', sequence: 2, from: 'explore', to: 'spec', previousRecordId: 'rec-1' })
    const r3 = record({ id: 'rec-3', sequence: 3, from: 'spec', to: 'build', previousRecordId: 'rec-2' })
    const r4 = record({ id: 'rec-4', sequence: 4, from: 'build', to: 'ship', previousRecordId: 'rec-3' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    await store.write(dir, r3)
    await store.write(dir, r4)
    const chain = await store.readChain(dir, 4, 'rec-4', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-1', 'rec-2', 'rec-3', 'rec-4'])
  })

  // 以下用例对应本轮 codex review 抓到的三个问题：
  // ① runId 权威来源错了——此前把"链首自称的 runId"当权威，只验证链内部彼此自洽；整条链
  //   （含链首）被替换成另一个 run 的记录，只要它们彼此 runId 一致，旧实现完全发现不了任何
  //   问题。权威现在来自调用方外部传入的 expectedRunId（调用方已经从 .pipeline.yaml 的
  //   runMetadata.runId 读到手上的值），不再信任链上自读出的数据自证。
  // ② read() 内部有两种真正会"抛出"而不是返回 undefined 的损坏场景——previousRecordId 被
  //   污染成非法值时 recordPath() 的校验抛 InvalidRecordIdentityError；文件内容不是合法 JSON
  //   时 JSON.parse 抛 SyntaxError。这两种此前会直接从 readChain() 传出去，而不是被当作"链在
  //   此断裂"处理。同时要确认真正的文件系统故障（EACCES/EIO 等）不在此列，必须继续 fail-loud，
  //   不能被一并静默吞掉。
  // ③ 上一轮加的两节点互指成环测试没有真正证明 visited set 生效——它在当前实现下会被步数
  //   上限/非法 sequence 校验先一步拦下，删掉 visited set 那部分代码它依然会通过。这里补一条
  //   3 跳、sequence 全程落在合法范围内、只有 visited set 才能拦下的用例。

  test('整条链（含链首）自称属于同一个 run，但跟调用方传入的 expectedRunId 不符 → 从链首起就' +
    '截断为空——仅验证链内部彼此自洽不足以发现"整条链被替换成另一个 run"，必须靠调用方已经从' +
    '权威来源（.pipeline.yaml runMetadata.runId）读到手上的 expectedRunId 才能识别（对应问题 ①：' +
    '若权威仍取自链首自证，rec-1/rec-2 彼此 runId 一致会被当作健康链完整放行，这里断言必须是' +
    '空链，直接证明权威已经切换到外部传入值）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1, runId: 'run-evil' })
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1', runId: 'run-evil' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-legit')
    expect(chain).toEqual([])
  })

  test('previousRecordId 被污染成非法值（如 "../bad"）→ read() 内部路径安全校验抛 ' +
    'InvalidRecordIdentityError，readChain 必须当作"链在此断裂"处理，不能把异常外抛给调用方' +
    '（对应问题 ②：这是"内容本身损坏/不可信"的一种，语义上等同于记录缺失）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: '../bad' })
    await store.write(dir, r2)
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  test('祖先记录文件内容不是合法 JSON（磁盘损坏/手工写坏）→ JSON.parse 抛 SyntaxError，readChain ' +
    '必须当作"链在此断裂"处理，不能把异常外抛给调用方（对应问题 ②）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r1 = record({ id: 'rec-1', sequence: 1 })
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r1)
    await store.write(dir, r2)
    const path = join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json')
    await writeFile(path, 'not-json{{{', 'utf8')
    const chain = await store.readChain(dir, 2, 'rec-2', 'run-1')
    expect(chain.map((r) => r.id)).toEqual(['rec-2'])
  })

  test('真实文件系统故障（目标路径其实是个目录，readFile 会抛 EISDIR）必须继续 fail-loud 抛错，' +
    '不能被当作"链在此断裂"静默吞掉——否则会把一次真实的基础设施故障伪装成"这条链就是这么短"' +
    '（对应问题 ②的另一半：InvalidRecordIdentityError/SyntaxError 之外的异常必须原样重新抛出）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    const r2 = record({ id: 'rec-2', sequence: 2, previousRecordId: 'rec-1' })
    await store.write(dir, r2) // 建立 .pipeline-transitions/ 目录
    // 不写 rec-1 的记录文件，而是在它本该存在的路径上造一个目录——readFile 遇到目录会抛
    // EISDIR，这是真实的 I/O 层面错误，既不是 InvalidRecordIdentityError 也不是 SyntaxError。
    await mkdir(join(dir, TRANSITION_RECORDS_DIR, '000001-rec-1.json'))
    await expect(store.readChain(dir, 2, 'rec-2', 'run-1')).rejects.toMatchObject({ code: 'EISDIR' })
  })

  test('id 在不同 sequence 复用（sequence=1 与 sequence=3 都叫 "A"，且两条记录各自内容都真实' +
    '自洽、并非篡改）→ visited set 必须真正生效，回溯到重复出现的 id 时截断，不是靠步数上限或' +
    'recordPath 校验顺带拦下（对应问题 ③：这条用例的 3 跳全部落在合法 sequence 范围内，不会' +
    '触发步数上限或非法 sequence 校验，只有 visited set 能拦下它——真正具备区分力）', async () => {
    const dir = await freshChangeDir()
    const store = createTransitionRecordStore()
    // sequence=1/id='A'：真实链首，不依赖任何 previousRecordId，内容与文件名完全自洽。
    const recA1 = record({ id: 'A', sequence: 1 })
    // sequence=2/id='B'：previousRecordId 指向 sequence=1 的 'A'。
    const recB2 = record({ id: 'B', sequence: 2, previousRecordId: 'A' })
    // sequence=3/id='A'（head）：previousRecordId 指向 'B'。id 跟 sequence=1 那条撞了，但两条
    // 记录各自的 id/sequence 字段都跟自己的文件名完全匹配，都不是被篡改的记录。
    const recA3 = record({ id: 'A', sequence: 3, previousRecordId: 'B' })
    await store.write(dir, recA1)
    await store.write(dir, recB2)
    await store.write(dir, recA3)
    const chain = await store.readChain(dir, 3, 'A', 'run-1')
    // 只应包含 sequence=2、sequence=3 两条；sequence=1 那条因为 id 'A' 已在 visited set 里
    // 出现过（来自 head 本身）而被截断，不出现在结果里，也不重复。
    expect(chain.map((r) => ({ id: r.id, sequence: r.sequence }))).toEqual([
      { id: 'B', sequence: 2 },
      { id: 'A', sequence: 3 },
    ])
  })
})
