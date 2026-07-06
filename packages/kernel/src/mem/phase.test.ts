/**
 * mem/phase —— task.py create|start 信号解析 + brainstorm 窗切片（真逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/phase.py。
 */
import { describe, expect, test } from 'vitest'
import {
  buildBrainstormWindows,
  parseTaskPyCommand,
  parseTaskPyCommandsAll,
  slugFromChangeDir,
  splitShellArgs,
} from './phase.js'

describe('parseTaskPyCommandsAll —— 信号恢复 + 三守卫（老仓 parse_task_py_commands_all:27）', () => {
  test('create --slug 抠出 slug', () => {
    expect(parseTaskPyCommandsAll('task.py create --slug foo-bar')).toEqual([
      { action: 'create', slug: 'foo-bar', titleArg: null },
    ])
  })

  test('create 位置 title（无 --slug）', () => {
    expect(parseTaskPyCommandsAll('task.py create myslug')).toEqual([
      { action: 'create', slug: null, titleArg: 'myslug' },
    ])
  })

  test('start 抠 taskDir（路径分隔符前导守卫①：python 前缀）', () => {
    expect(parseTaskPyCommandsAll('python task.py start changes/2026-06-22-foo/')).toEqual([
      { action: 'start', taskDir: 'changes/2026-06-22-foo/' },
    ])
  })

  test('守卫②散文剥除：task.py create thing please → 丢', () => {
    expect(parseTaskPyCommandsAll('run task.py create thing please')).toEqual([])
  })

  test('守卫③ create 无 slug 无 title → 丢', () => {
    expect(parseTaskPyCommandsAll('task.py create')).toEqual([])
  })

  test('守卫③ start 无 taskDir → 丢', () => {
    expect(parseTaskPyCommandsAll('task.py start')).toEqual([])
  })

  test('守卫① task.py 嵌在 --slug= 里不误报', () => {
    expect(parseTaskPyCommandsAll('foo --slug=task.py-thing create')).toEqual([])
  })

  test('非字符串 → []', () => {
    expect(parseTaskPyCommandsAll(123 as unknown as string)).toEqual([])
  })

  test('parseTaskPyCommand 返首个或 null', () => {
    expect(parseTaskPyCommand('task.py create --slug a')).toEqual({ action: 'create', slug: 'a', titleArg: null })
    expect(parseTaskPyCommand('nothing here')).toBeNull()
  })
})

describe('splitShellArgs —— 引号感知 shell 拆分（老仓 split_shell_args:104）', () => {
  test('引号内空白不拆 + 尾 shell-meta 剥除', () => {
    expect(splitShellArgs('--slug "foo bar" baz)')).toEqual(['--slug', 'foo bar', 'baz'])
  })
})

describe('slugFromChangeDir —— YYYY-MM-DD- 前缀剥除（老仓 slug_from_change_dir:142）', () => {
  test('changes/2026-06-22-mem-phase-slice/ → mem-phase-slice', () => {
    expect(slugFromChangeDir('changes/2026-06-22-mem-phase-slice/')).toBe('mem-phase-slice')
  })

  test('null → null', () => {
    expect(slugFromChangeDir(null)).toBeNull()
  })
})

describe('buildBrainstormWindows —— create→start 配对成窗（老仓 build_brainstorm_windows:160）', () => {
  test('Pass1 slug 精确匹配', () => {
    const events = [
      { action: 'create' as const, slug: 'foo', turnIndex: 0 },
      { action: 'start' as const, taskDir: 'changes/2026-01-01-foo/', turnIndex: 5 },
    ]
    expect(buildBrainstormWindows(events, 10)).toEqual([{ label: 'foo', startTurn: 0, endTurn: 5 }])
  })

  test('未配对 create → [create, total_turns)', () => {
    const events = [{ action: 'create' as const, slug: 'x', turnIndex: 2 }]
    expect(buildBrainstormWindows(events, 8)).toEqual([{ label: 'x', startTurn: 2, endTurn: 8 }])
  })

  test('未配对 start → [0, start)', () => {
    const events = [{ action: 'start' as const, taskDir: 'changes/2026-01-01-y/', turnIndex: 4 }]
    expect(buildBrainstormWindows(events, 9)).toEqual([{ label: 'y', startTurn: 0, endTurn: 4 }])
  })

  test('endTurn<startTurn 守卫丢弃', () => {
    const events = [
      { action: 'create' as const, slug: 'z', turnIndex: 6 },
      { action: 'start' as const, taskDir: 'changes/2026-01-01-z/', turnIndex: 2 },
    ]
    // 配对成 [6,2) → 守卫丢；但 start 已被 pass1 消耗，故窗为空
    expect(buildBrainstormWindows(events, 10)).toEqual([])
  })
})
