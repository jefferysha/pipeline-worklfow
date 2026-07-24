/**
 * parseTrackRegistry —— `.pipeline/tracks.yaml` 窄 YAML 解析（镜像 loops/registry.ts 路线，
 * 另带行号 fail-loud）。覆盖：裁决 schema 完整样例、builtins 覆写各形态（含 policy_profile
 * 解析保真带出——拒绝在 validate 层）、allowed 的 '*'/流式/块式、注释与空行、
 * 以及缺 version / 未知键 / 坏缩进 / 类型错误 / 重复键的带行号报错。
 */
import { describe, expect, test } from 'vitest'
import { parseTrackRegistry, TrackConfigParseError } from './parse.js'

const RULING_SAMPLE = `version: 1
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

describe('parseTrackRegistry —— 合法形状', () => {
  test('裁决 schema 完整样例 → camelCase 配置', () => {
    expect(parseTrackRegistry(RULING_SAMPLE)).toStrictEqual({
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
    })
  })

  test('最小文件：只有 version', () => {
    expect(parseTrackRegistry('version: 1\n')).toStrictEqual({ version: 1 })
  })

  test('builtins 只覆 label / 只覆 workflow.default（部分覆写）', () => {
    const y = `version: 1
builtins:
  chat:
    label: 会话
  pm:
    workflow:
      default: wf-a
`
    expect(parseTrackRegistry(y)).toStrictEqual({
      version: 1,
      builtins: {
        chat: { label: '会话' },
        pm: { workflow: { default: 'wf-a' } },
      },
    })
  })

  test('builtins 带 policy_profile —— 解析保真带出（v1 拒绝属 validate 层职责）', () => {
    const y = `version: 1
builtins:
  chat:
    policy_profile:
      review_seed: skipped
`
    expect(parseTrackRegistry(y)).toStrictEqual({
      version: 1,
      builtins: { chat: { policyProfile: { reviewSeed: 'skipped' } } },
    })
  })

  test("allowed：引号 '*' 与裸 * 等价；流式与块式列表等价", () => {
    const flow = `version: 1
tracks:
  - id: data
    workflow:
      default: wf-a
      allowed: [wf-a, default]
`
    const block = `version: 1
tracks:
  - id: data
    workflow:
      default: wf-a
      allowed:
        - wf-a
        - default
`
    expect(parseTrackRegistry(flow)).toStrictEqual(parseTrackRegistry(block))
    const starQuoted = parseTrackRegistry(`version: 1\nbuiltins:\n  chat:\n    workflow:\n      allowed: '*'\n`)
    const starBare = parseTrackRegistry(`version: 1\nbuiltins:\n  chat:\n    workflow:\n      allowed: *\n`)
    expect(starQuoted).toStrictEqual(starBare)
    expect(starQuoted.builtins?.chat?.workflow?.allowed).toBe('*')
  })

  test('注释与空行忽略；裸标量剥行尾注释；引号内 # 保留', () => {
    const y = `# 头注释
version: 1

tracks:
  - id: data   # 行尾注释
    label: Data # 备注
    workflow:
      default: wf-a
    policy_profile:
      routing:
        enabled: true
        pattern: '(a #b)'
        priority: 1
`
    const config = parseTrackRegistry(y)
    const entry = config.tracks?.[0]
    expect(entry?.id).toBe('data')
    expect(entry?.label).toBe('Data')
    expect(entry?.policyProfile?.routing?.pattern).toBe('(a #b)')
  })

  test('空 section（builtins:/tracks: 无内容）视同省略', () => {
    expect(parseTrackRegistry('version: 1\nbuiltins:\ntracks:\n')).toStrictEqual({ version: 1 })
  })

  test('空覆写条目（chat: 无子键）解析为空对象', () => {
    expect(parseTrackRegistry('version: 1\nbuiltins:\n  chat:\n')).toStrictEqual({
      version: 1,
      builtins: { chat: {} },
    })
  })
})

describe('parseTrackRegistry —— fail-loud 带行号', () => {
  test('缺 version → 可读错误', () => {
    expect(() => parseTrackRegistry('builtins:\n  chat:\n    label: X\n')).toThrow(TrackConfigParseError)
    expect(() => parseTrackRegistry('builtins:\n  chat:\n    label: X\n')).toThrow(/缺少必填顶层键 version/)
  })

  test('version ≠ 1 → 带行号', () => {
    expect(() => parseTrackRegistry('version: 2\n')).toThrow(/tracks\.yaml:1: version 只支持 1/)
  })

  test('未知顶层键 → 带行号', () => {
    expect(() => parseTrackRegistry('version: 1\nfoo: 1\n')).toThrow(/tracks\.yaml:2: .*未知键 'foo'/)
  })

  test('track 条目未知键 → 带行号', () => {
    const y = `version: 1
tracks:
  - id: data
    color: red
`
    expect(() => parseTrackRegistry(y)).toThrow(/tracks\.yaml:4: .*未知键 'color'/)
  })

  test('policy_profile 未知键 → 带行号', () => {
    const y = `version: 1
tracks:
  - id: data
    policy_profile:
      retry: 3
`
    expect(() => parseTrackRegistry(y)).toThrow(/tracks\.yaml:5: .*未知键 'retry'/)
  })

  test('类型错误：id 非字符串 / label 列表 / priority 非整数 / AFK policy 非布尔', () => {
    expect(() => parseTrackRegistry('version: 1\ntracks:\n  - id: 123\n')).toThrow(/tracks\.yaml:3: .*应为字符串/)
    expect(() => parseTrackRegistry('version: 1\ntracks:\n  - id: data\n    label: [a, b]\n')).toThrow(
      /tracks\.yaml:4: .*应为字符串/,
    )
    const badPriority = `version: 1
tracks:
  - id: data
    policy_profile:
      routing:
        priority: high
`
    expect(() => parseTrackRegistry(badPriority)).toThrow(/tracks\.yaml:6: .*应为整数/)
    const badBool = `version: 1
tracks:
  - id: data
    policy_profile:
      auto_enqueue_on_spec_complete: yes
`
    expect(() => parseTrackRegistry(badBool)).toThrow(/tracks\.yaml:5: .*应为布尔/)
  })

  test('缩进错乱 → 带行号', () => {
    const y = `version: 1
tracks:
  - id: data
   label: x
`
    expect(() => parseTrackRegistry(y)).toThrow(/tracks\.yaml:4: 残留未解析内容/)
  })

  test('缩进含 tab → 带行号', () => {
    expect(() => parseTrackRegistry('version: 1\nbuiltins:\n\tchat:\n')).toThrow(/tracks\.yaml:3: .*tab/)
  })

  test('重复键 → 带行号', () => {
    expect(() => parseTrackRegistry('version: 1\nversion: 1\n')).toThrow(/tracks\.yaml:2: 重复键 'version'/)
  })

  test('空文档 → 报错', () => {
    expect(() => parseTrackRegistry('')).toThrow(/空文档/)
    expect(() => parseTrackRegistry('\n# 只有注释\n')).toThrow(/空文档/)
  })

  test('流式列表未闭合 → 带行号', () => {
    const y = `version: 1
tracks:
  - id: data
    workflow:
      allowed: [a, b
`
    expect(() => parseTrackRegistry(y)).toThrow(/tracks\.yaml:5: 流式列表未闭合/)
  })

  test("allowed 给了裸字符串（非 '*'）→ 报错", () => {
    const y = `version: 1
tracks:
  - id: data
    workflow:
      allowed: wf-a
`
    expect(() => parseTrackRegistry(y)).toThrow(/tracks\.yaml:5: .*只支持 '\*' 或工作流 id 列表/)
  })
})

describe('parseTrackRegistry —— 畸形标量 fail-loud（codex R1 review 三案）', () => {
  test('未闭合引号（单/双/只有起始引号）→ 带行号报错', () => {
    const single = "version: 1\nbuiltins:\n  chat:\n    label: 'unterminated\n"
    expect(() => parseTrackRegistry(single)).toThrow(TrackConfigParseError)
    expect(() => parseTrackRegistry(single)).toThrow(/tracks\.yaml:4: 引号未闭合/)
    expect(() => parseTrackRegistry('version: 1\nbuiltins:\n  chat:\n    label: "unterminated\n')).toThrow(
      /tracks\.yaml:4: 引号未闭合/,
    )
    expect(() => parseTrackRegistry("version: 1\nbuiltins:\n  chat:\n    label: '\n")).toThrow(/引号未闭合/)
  })

  test('未闭合引号反面：正常闭合、内含另一种引号、空串照常解析', () => {
    const y = `version: 1
builtins:
  chat:
    label: 'say "hi"'
  pm:
    label: ""
`
    expect(parseTrackRegistry(y)).toStrictEqual({
      version: 1,
      builtins: { chat: { label: 'say "hi"' }, pm: { label: '' } },
    })
  })

  test('流式 mapping（{} 与 { k: v }）→ 带行号报错', () => {
    expect(() => parseTrackRegistry('version: 1\nbuiltins:\n  chat:\n    label: {}\n')).toThrow(
      /tracks\.yaml:4: .*流式 mapping/,
    )
    expect(() =>
      parseTrackRegistry('version: 1\nbuiltins:\n  chat:\n    workflow: { default: wf-a }\n'),
    ).toThrow(/tracks\.yaml:4: .*流式 mapping/)
  })

  test('流式 mapping 反面：流式数组是已支持语法，不误伤（含流式列表项也拒 { 开头）', () => {
    const y = `version: 1
tracks:
  - id: data
    workflow:
      default: wf-a
      allowed: [wf-a, default]
`
    expect(parseTrackRegistry(y).tracks?.[0]?.workflow?.allowed).toEqual(['wf-a', 'default'])
    expect(() =>
      parseTrackRegistry('version: 1\ntracks:\n  - id: data\n    workflow:\n      allowed: [{}, wf-a]\n'),
    ).toThrow(/tracks\.yaml:5: .*流式 mapping/)
  })

  test('引号闭合后：行内注释剥离；非注释尾巴报错；# 紧贴引号（无空白）也报错', () => {
    const y = `version: 1
builtins:
  chat:
    label: 'Data' # comment
  pm:
    label: "Data" # 备注
`
    expect(parseTrackRegistry(y)).toStrictEqual({
      version: 1,
      builtins: { chat: { label: 'Data' }, pm: { label: 'Data' } },
    })
    expect(() => parseTrackRegistry("version: 1\nbuiltins:\n  chat:\n    label: 'Data' junk\n")).toThrow(
      /tracks\.yaml:4: .*残留/,
    )
    expect(() => parseTrackRegistry("version: 1\nbuiltins:\n  chat:\n    label: 'Data'#c\n")).toThrow(
      /tracks\.yaml:4: .*残留/,
    )
  })

  test('值整个是注释（`label: # 注释`）→ 按空值处理，走形状报错而非吞成字符串', () => {
    expect(() => parseTrackRegistry('version: 1\nbuiltins:\n  chat:\n    label: # 注释\n')).toThrow(
      /tracks\.yaml:4: .*应为字符串，得到 空值/,
    )
  })
})
