/**
 * session 内核纯逻辑单测（BACKLOG #17，GOAL A1 内核深度）。
 * 无 mock：纯函数真调真断言（对齐 TEST-REALITY.md「kernel 单元 = 真」）。
 * 真相源：老仓 state-session.sh cmd_activate/cmd_route_context + monorepo.py route_paths/package_for_path。
 */
import { describe, expect, test } from 'vitest'
import {
  normalizeRelPath,
  packageForPath,
  parseProjectPackages,
  pathInSubtree,
  relatedFilesFromField,
  renderRouteContextText,
  routeBucketsToObject,
  routeContext,
  validateChangeName,
  type PackageDecl,
} from './session.js'

// _MONO_CFG 逐字取自老仓 tests/test_monorepo_routing.py:69-80（route parity 锚）
const MONO_CFG =
  'packages:\n' +
  '  web:\n' +
  '    path: apps/web\n' +
  '  api:\n' +
  '    path: services/api\n' +
  '  shared:\n' +
  '    path: packages/shared\n' +
  '  webadmin:\n' +
  '    path: apps/web/admin\n' +
  'default_package: web\n'

describe('validateChangeName（老仓 validate_change_name state-lib.sh:11-25）', () => {
  test('合法名 → ok', () => {
    expect(validateChangeName('add-session-9')).toEqual({ ok: true })
    expect(validateChangeName('a_b_C0')).toEqual({ ok: true })
  })
  test('空 / undefined → 空名错误', () => {
    expect(validateChangeName('')).toMatchObject({ ok: false })
    expect(validateChangeName(undefined)).toMatchObject({ ok: false })
    expect((validateChangeName('') as { error: string }).error).toContain('不能为空')
  })
  test('非法字符 / .. → 非法字符错误（`.` 不在字符集，路径穿越先被字符集挡）', () => {
    expect(validateChangeName('bad/x')).toMatchObject({ ok: false })
    expect(validateChangeName('a b')).toMatchObject({ ok: false })
    expect(validateChangeName('..')).toMatchObject({ ok: false })
    expect((validateChangeName('bad/x') as { error: string }).error).toContain('非法字符')
  })
})

describe('parseProjectPackages（老仓 monorepo.py get_packages：仅 dict 值 entry，标量过滤 → null）', () => {
  test('无 packages 节 → null（单仓默认分支）', () => {
    expect(parseProjectPackages('x: 1\n')).toBeNull()
    expect(parseProjectPackages('')).toBeNull()
  })
  test('packages 全标量 entry → 过滤后空 → null（老仓 Z2）', () => {
    expect(parseProjectPackages('packages:\n  foo: bar\n  baz: 123\n')).toBeNull()
  })
  test('MONO_CFG → 4 包（path 子键；default_package 顶层键终止块）', () => {
    const decls = parseProjectPackages(MONO_CFG)
    expect(decls).toEqual([
      { name: 'web', path: 'apps/web' },
      { name: 'api', path: 'services/api' },
      { name: 'shared', path: 'packages/shared' },
      { name: 'webadmin', path: 'apps/web/admin' },
    ])
  })
  test('map entry 无 path 子键 → path 默认取包名（老仓 cfg.get("path", name)）', () => {
    const decls = parseProjectPackages('packages:\n  web:\n    type: frontend\n')
    expect(decls).toEqual([{ name: 'web', path: 'web' }])
  })
  test('packages 带内联标量值（非 map）→ null', () => {
    expect(parseProjectPackages('packages: foo\n')).toBeNull()
  })
})

describe('normalizeRelPath（老仓 _normalize_rel_path monorepo.py:207-219）', () => {
  test('去前导 ./、末尾 /、反斜杠→/', () => {
    expect(normalizeRelPath('./apps/web/x')).toBe('apps/web/x')
    expect(normalizeRelPath('apps/web/')).toBe('apps/web')
    expect(normalizeRelPath('apps\\web\\x')).toBe('apps/web/x')
    expect(normalizeRelPath('././a/')).toBe('a')
  })
  test('根 "/" 保留', () => {
    expect(normalizeRelPath('/')).toBe('/')
  })
})

describe('pathInSubtree（老仓 _path_in_subtree monorepo.py:220-230）', () => {
  test('精确等 / 子树内 → true', () => {
    expect(pathInSubtree('apps/web', 'apps/web')).toBe(true)
    expect(pathInSubtree('apps/web/src/App.tsx', 'apps/web')).toBe(true)
  })
  test('前缀字符串相同但非子树边界 → false（apps/website ∉ apps/web）', () => {
    expect(pathInSubtree('apps/website', 'apps/web')).toBe(false)
  })
})

describe('packageForPath（老仓 package_for_path monorepo.py:233-257）', () => {
  const decls = parseProjectPackages(MONO_CFG) as PackageDecl[]
  test('单仓（packages=null）→ null（不臆造归属）', () => {
    expect(packageForPath('apps/web/src/App.tsx', null)).toBeNull()
  })
  test('子树归属', () => {
    expect(packageForPath('apps/web/src/App.tsx', decls)).toBe('web')
    expect(packageForPath('services/api/main.py', decls)).toBe('api')
    expect(packageForPath('packages/shared/util.ts', decls)).toBe('shared')
  })
  test('最长前缀最具体子树赢（apps/web/admin → webadmin，非 web）', () => {
    expect(packageForPath('apps/web/admin/panel.tsx', decls)).toBe('webadmin')
  })
  test('精确等于 package path 目录本身 → 归属', () => {
    expect(packageForPath('services/api', decls)).toBe('api')
  })
  test('归一后命中（前导 ./ / 反斜杠 / 末尾 /）', () => {
    expect(packageForPath('./apps/web/src/App.tsx', decls)).toBe('web')
    expect(packageForPath('apps\\web\\src\\x.ts', decls)).toBe('web')
  })
  test('不在任何 package 子树 → null（不强塞 default）', () => {
    expect(packageForPath('docs/readme.md', decls)).toBeNull()
  })
})

describe('routeContext + routeBucketsToObject（老仓 route_paths monorepo.py:260-269）', () => {
  test('单仓 → 全落 null 桶（保入参序）', () => {
    const b = routeContext(['apps/web/a.ts', 'services/api/b.py'], null)
    expect(b).toEqual([{ package: null, paths: ['apps/web/a.ts', 'services/api/b.py'] }])
    expect(routeBucketsToObject(b)).toEqual({ null: ['apps/web/a.ts', 'services/api/b.py'] })
  })
  test('空路径集 → 空桶集 → {}', () => {
    expect(routeContext([], null)).toEqual([])
    expect(routeBucketsToObject(routeContext([], null))).toEqual({})
  })
  test('monorepo → 按首见包分桶，未归属落 null 桶（插入序稳定）', () => {
    const decls = parseProjectPackages(MONO_CFG) as PackageDecl[]
    const b = routeContext(
      ['services/api/x.py', 'apps/web/a.ts', 'docs/z.md', 'apps/web/b.ts'],
      decls,
    )
    expect(b).toEqual([
      { package: 'api', paths: ['services/api/x.py'] },
      { package: 'web', paths: ['apps/web/a.ts', 'apps/web/b.ts'] },
      { package: null, paths: ['docs/z.md'] },
    ])
  })
})

describe('renderRouteContextText（老仓 cmd_route_context 内联 python 渲染 state-session.sh:218-234）', () => {
  test('空桶 → header + 未配置提示', () => {
    expect(renderRouteContextText('chg', {})).toEqual([
      '[ROUTE-CONTEXT] chg related_files 按 package 归属：',
      '  (no related files / 未配置 package — 全未归属)',
    ])
  })
  test('null 桶排最后 + 其余字典序 + 未归属 label', () => {
    const obj = routeBucketsToObject(
      routeContext(['docs/z.md', 'services/api/x.py', 'apps/web/a.ts'], parseProjectPackages(MONO_CFG) as PackageDecl[]),
    )
    expect(renderRouteContextText('chg', obj)).toEqual([
      '[ROUTE-CONTEXT] chg related_files 按 package 归属：',
      '  [api]',
      '    - services/api/x.py',
      '  [web]',
      '    - apps/web/a.ts',
      '  [(未归属)]',
      '    - docs/z.md',
    ])
  })
})

describe('relatedFilesFromField（老仓 _related_read state-session.sh:111-115）', () => {
  test('null / 空 / undefined → []', () => {
    expect(relatedFilesFromField('null')).toEqual([])
    expect(relatedFilesFromField('')).toEqual([])
    expect(relatedFilesFromField(undefined)).toEqual([])
    expect(relatedFilesFromField([])).toEqual([])
  })
  test('CSV 标量 → trim 去空成员', () => {
    expect(relatedFilesFromField(' a , b ,, c ')).toEqual(['a', 'b', 'c'])
  })
  test('数组（新仓 list 存储）→ trim 去空', () => {
    expect(relatedFilesFromField([' a ', '', 'b'])).toEqual(['a', 'b'])
  })
})
