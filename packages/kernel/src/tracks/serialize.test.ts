/**
 * serializeTrackRegistry —— 确定性（键序固定、同 config 两次输出逐字节相等）+ 与 parse 的
 * 往返稳定（parse(serialize(x)) 结构相等；空 section/空对象规范化为省略后幂等）。
 * 规范化会重排键序、丢手写注释——这是 codex 裁决接受的 CRUD 行为，测试同时钉住规范文本快照。
 */
import { describe, expect, test } from 'vitest'
import type { ProjectTrackConfig } from './types.js'
import { parseTrackRegistry } from './parse.js'
import { serializeTrackRegistry } from './serialize.js'

const SAMPLE: ProjectTrackConfig = {
  version: 1,
  builtins: { chat: { label: 'Chat', workflow: { default: 'default', allowed: '*' } } },
  tracks: [
    {
      id: 'data',
      label: 'Data',
      workflow: { default: 'data-pipeline', allowed: ['data-pipeline', 'default'] },
      policyProfile: {
        reviewSeed: 'pending',
        autoEnqueueOnSpecComplete: true,
        automationEligible: true,
        coverageProfile: 'backend',
        routing: {
          enabled: true,
          pattern: '(数据|ETL|warehouse)',
          excludePattern: '(API|schema)',
          priority: 150,
        },
        skills: { matrix: true, profile: 'backend' },
      },
    },
  ],
}

const CANONICAL = `version: 1
builtins:
  chat:
    label: Chat
    workflow:
      default: default
      allowed: '*'
tracks:
  - id: data
    label: Data
    workflow:
      default: data-pipeline
      allowed: [data-pipeline, default]
    policy_profile:
      review_seed: pending
      auto_enqueue_on_spec_complete: true
      automation_eligible: true
      coverage_profile: backend
      routing:
        enabled: true
        pattern: '(数据|ETL|warehouse)'
        exclude_pattern: '(API|schema)'
        priority: 150
      skills:
        matrix: true
        profile: backend
`

describe('serializeTrackRegistry', () => {
  test('规范文本快照：裁决样例 config → 逐字等于规范 YAML', () => {
    expect(serializeTrackRegistry(SAMPLE)).toBe(CANONICAL)
  })

  test('确定性：同 config 两次输出逐字节相等', () => {
    expect(serializeTrackRegistry(SAMPLE)).toBe(serializeTrackRegistry(SAMPLE))
  })

  test('键序 canonical：builtins 插入序不同 → 输出相同（按内建声明顺序）', () => {
    const a: ProjectTrackConfig = { version: 1, builtins: { pm: { label: 'P' }, chat: { label: 'C' } } }
    const b: ProjectTrackConfig = { version: 1, builtins: { chat: { label: 'C' }, pm: { label: 'P' } } }
    const out = serializeTrackRegistry(a)
    expect(out).toBe(serializeTrackRegistry(b))
    expect(out.indexOf('chat:')).toBeLessThan(out.indexOf('pm:'))
  })

  test('往返：parse(serialize(x)) 与 x 结构相等', () => {
    expect(parseTrackRegistry(serializeTrackRegistry(SAMPLE))).toStrictEqual(SAMPLE)
  })

  test('规范化：空 tracks/空 builtins/空覆写省略；serialize∘parse 幂等', () => {
    expect(serializeTrackRegistry({ version: 1, tracks: [] })).toBe('version: 1\n')
    expect(serializeTrackRegistry({ version: 1, builtins: {} })).toBe('version: 1\n')
    expect(serializeTrackRegistry({ version: 1, builtins: { chat: {} } })).toBe('version: 1\n')
    const once = serializeTrackRegistry(SAMPLE)
    expect(serializeTrackRegistry(parseTrackRegistry(once))).toBe(once)
  })

  test('引号规则：中文/含反斜杠 pattern/歧义标量（int·bool 形字符串）往返保真', () => {
    const config: ProjectTrackConfig = {
      version: 1,
      builtins: { chat: { label: '会话' } },
      tracks: [
        {
          id: 'ops',
          label: 'true',
          workflow: { default: 'default', allowed: ['default'] },
          policyProfile: {
            reviewSeed: 'skipped',
            automationEligible: false,
            coverageProfile: 'none',
            routing: { enabled: true, pattern: '(\\.tsx|web 设计|Go )', priority: 0 },
            skills: { matrix: false, profile: '_all' },
          },
        },
      ],
    }
    const roundTripped = parseTrackRegistry(serializeTrackRegistry(config))
    expect(roundTripped).toStrictEqual(config)
    expect(roundTripped.tracks?.[0]?.label).toBe('true')
    expect(typeof roundTripped.tracks?.[0]?.label).toBe('string')
    // int 形字符串也须保持字符串型
    const numLabel: ProjectTrackConfig = { version: 1, builtins: { chat: { label: '123' } } }
    expect(parseTrackRegistry(serializeTrackRegistry(numLabel)).builtins?.chat?.label).toBe('123')
  })

  test('builtins 的 policy_profile 覆写（v1 非法但可表示）也能往返——拒绝职责在 validate', () => {
    const config: ProjectTrackConfig = {
      version: 1,
      builtins: { chat: { policyProfile: { reviewSeed: 'skipped', routing: { enabled: false } } } },
    }
    expect(parseTrackRegistry(serializeTrackRegistry(config))).toStrictEqual(config)
  })

  test('窄子集越界 fail-loud：换行/tab 字符串 / 同时含单双引号 / 非法 mapping 键', () => {
    expect(() => serializeTrackRegistry({ version: 1, builtins: { chat: { label: 'a\nb' } } })).toThrow(/换行/)
    expect(() => serializeTrackRegistry({ version: 1, builtins: { chat: { label: 'a\tb' } } })).toThrow(/tab/)
    expect(() =>
      serializeTrackRegistry({ version: 1, builtins: { chat: { label: `a'b"c` } } }),
    ).toThrow(/单双引号/)
    expect(() => serializeTrackRegistry({ version: 1, builtins: { 数据: { label: 'x' } } })).toThrow(/mapping 键/)
  })

  test('整数防御闸（纵深防御，主闸在 validate）：1e21 直喂 serialize → 拒写，而非落盘 parse 读不回的 1e+21', () => {
    const cfg: ProjectTrackConfig = {
      version: 1,
      tracks: [
        {
          id: 'x',
          label: 'X',
          workflow: { default: 'default', allowed: '*' },
          policyProfile: {
            reviewSeed: 'pending',
            automationEligible: true,
            coverageProfile: 'none',
            routing: { enabled: true, pattern: 'x', priority: 1e21 },
            skills: { matrix: false, profile: '_all' },
          },
        },
      ],
    }
    expect(() => serializeTrackRegistry(cfg)).toThrow(/纯十进制/)
  })

  test('可表示域正例：前后导空白/含 # 走引号包裹、含逗号的 allowed 项降级块式——往返保真（拒绝面之外无误伤）', () => {
    const cfg: ProjectTrackConfig = {
      version: 1,
      builtins: {
        chat: { label: ' 边缘 空白 ', workflow: { default: 'default', allowed: ['default', 'a,b', 'x #y'] } },
      },
    }
    expect(parseTrackRegistry(serializeTrackRegistry(cfg))).toStrictEqual(cfg)
  })

  test('U+2028/U+2029 行分隔符与成对 astral surrogate（emoji）往返保真（codex R3 阻断 1：' +
    'parser 值捕获从 .* 放宽到 [\\s\\S]* 后，写出的引号标量能读回，write→load 合同闭合）', () => {
    const cfg: ProjectTrackConfig = {
      version: 1,
      builtins: {
        chat: { label: 'line sep here' },
        pm: { label: '状态 😀 ok' },
      },
    }
    expect(parseTrackRegistry(serializeTrackRegistry(cfg))).toStrictEqual(cfg)
  })
})
