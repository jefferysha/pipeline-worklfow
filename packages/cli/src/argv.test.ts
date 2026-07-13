import { describe, expect, test } from 'vitest'
import { splitFlags, splitPassthroughArgv } from './argv.js'

// argv[0]=node、argv[1]=脚本路径（splitPassthroughArgv 从 index 2 起找 `--`）
const A = ['node', '/x/pipeline.mjs']

describe('splitPassthroughArgv —— 仅 tap 切 passthrough，其余 `--` 尾段还给 commander', () => {
  test('无 `--` → 原样 toParse、无 passthrough', () => {
    const r = splitPassthroughArgv([...A, 'loops', 'init', 'x'])
    expect(r.passthrough).toBeUndefined()
    expect(r.toParse).toEqual([...A, 'loops', 'init', 'x'])
  })

  test('tap + `--` → 切分：passthrough = `--` 后段，toParse 去掉 `--` 及其后', () => {
    const r = splitPassthroughArgv([...A, 'tap', 'start', 'claude', '--', 'my', 'cmd', '--flag'])
    expect(r.toParse).toEqual([...A, 'tap', 'start', 'claude'])
    expect(r.passthrough).toEqual(['my', 'cmd', '--flag'])
  })

  test('非 tap（loops）+ `--` → 不切分：`--` 尾段留在 toParse 交给 commander，extra 不蒸发', () => {
    const r = splitPassthroughArgv([...A, 'loops', 'init', 'x', '--', 'extra'])
    expect(r.passthrough).toBeUndefined()
    expect(r.toParse).toEqual([...A, 'loops', 'init', 'x', '--', 'extra'])
  })
})

describe('splitFlags —— 通用 --flag 分离器（语义 = mem/channel 手写 parseArgs 现行为，逐字保持）', () => {
  test('--k v → 收值；v 不进 positional', () => {
    expect(splitFlags(['--k', 'v'])).toEqual({ positional: [], flags: { k: 'v' } })
  })

  test('裸 --k（末尾）→ true', () => {
    expect(splitFlags(['--k'])).toEqual({ positional: [], flags: { k: true } })
  })

  test('值不吞 flag：--k 后跟 --j → 两者皆 true（next 以 -- 开头不当值）', () => {
    expect(splitFlags(['--k', '--j'])).toEqual({ positional: [], flags: { k: true, j: true } })
  })

  test('单破折 next 被当值吞掉（现行为：只挡 -- 前缀，不挡 -x/负数）', () => {
    expect(splitFlags(['--limit', '-1'])).toEqual({ positional: [], flags: { limit: '-1' } })
  })

  test('混合序：positional 与 flag 交错，positional 保序收集；flag 后的裸词被吞为值', () => {
    expect(splitFlags(['p1', '--k', 'v', 'p2', '--b', 'p3'])).toEqual({
      positional: ['p1', 'p2'],
      flags: { k: 'v', b: 'p3' },
    })
  })

  test('空串可以当值：--k "" → flags.k = ""（与裸 flag 的 true 哨兵可区分）', () => {
    expect(splitFlags(['--k', ''])).toEqual({ positional: [], flags: { k: '' } })
  })

  test('重复 flag 后者胜（现行为：直接覆盖）', () => {
    expect(splitFlags(['--k', 'a', '--k', 'b'])).toEqual({ positional: [], flags: { k: 'b' } })
  })

  test('无 flag → 全 positional；空数组 → 双空', () => {
    expect(splitFlags(['a', 'b'])).toEqual({ positional: ['a', 'b'], flags: {} })
    expect(splitFlags([])).toEqual({ positional: [], flags: {} })
  })

  test('独立 `--` token → 空 key flag（现行为钉住：调用方已在上游切走 tap passthrough）', () => {
    expect(splitFlags(['--', 'x'])).toEqual({ positional: [], flags: { '': 'x' } })
  })

  test('--k=v 不拆等号（现行为：key 含 =，裸 → true）', () => {
    expect(splitFlags(['--k=v'])).toEqual({ positional: [], flags: { 'k=v': true } })
  })
})
