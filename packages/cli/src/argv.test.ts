import { describe, expect, test } from 'vitest'
import { splitPassthroughArgv } from './argv.js'

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
