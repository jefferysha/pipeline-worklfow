/**
 * session —— change 级会话操作：activate（激活当前 change）+ route-context（related_files 按包路由）。
 *
 * 老仓真相源（严格只读参考，行号锚定 workflow-plugin/skills/pipeline/scripts/）：
 *   dispatch:  pipeline-state.sh:95  `activate`       → state-session.sh cmd_activate
 *              pipeline-state.sh:101 `route-context`  → state-session.sh cmd_route_context
 *   activate       : state-session.sh:28-45   （cmd_activate）
 *   route-context  : state-session.sh:192-236 （cmd_route_context）
 *   _related_read  : state-session.sh:109-115
 *   路由引擎        : monorepo.py package_for_path:233-257 / route_paths:260-269 /
 *                     _normalize_rel_path:207-219 / _path_in_subtree:220-230 / get_packages:109-121 /
 *                     route-paths CLI 分派:872-880（stdin 每行一路径 → {package:[paths]} JSON，null 桶键→"null"）
 *   validate_change_name / ensure_state_exists : state-lib.sh:11-25 / 42-49
 *
 * 语义对位（逐条锚定老仓行为）：
 *  1. activate（:28-45）：validate 名 + ensure 状态文件存在，然后把「本 session 活跃指针」交给
 *     持久化层落盘；老仓委托 session_store.py（R20 per-session context-keyed 指针，degraded 绝不 exit 1）。
 *     本内核只提供纯决策 + 名校验；指针落盘是 CLI 注入面（SessionFs.bindPointer），degraded-safe
 *     语义在 CLI 侧对齐（写失败 → WARN、rc=0，不动 phase/phase_status/assignee）。
 *     [见 CLI 顶注「老仓亦未实现/未移植」段：session_store.py 的 context_key 解析子系统尚未移植]。
 *  2. route-context（:192-236）：读 related_files（_related_read CSV 口径）→ 按声明 package path 路由。
 *     路由引擎是纯逻辑（此处真实现）：单仓（packages=null）全落 null 桶（老仓「单仓全未归属，零副作用」）；
 *     monorepo 按声明 path 最长前缀把每条 related_file 分到归属包（最具体子树赢）；不在任何子树 → null 桶。
 *  3. packages 声明来源：老仓从项目根 .pipeline-project.yaml `packages:` 节读（monorepo.py get_packages：
 *     仅 dict 值 entry 计入，标量过滤后空 → None 单仓）。此处提供 parseProjectPackages 窄解析器
 *     （零第三方依赖，仅认「顶层 packages: 块 → 名: {path:...}」子集），CLI 注入真读 .pipeline-project.yaml。
 *
 * 占位诚实标注（老仓 state-session.sh:238-253 [PLACEHOLDER]，老仓自己都未实现——照实标注、不臆造）：
 *   · package-validation：仅在 monorepo 语境下有意义；本项目是单 repo、无包模型，故该校验恒为
 *     no-op（不是缺口，是当前形态下无对象可校验）。
 *   · Cursor ticket 写入端：只有读端（老仓 R20/R21）。写端本该是 Cursor 的 beforeShellExecution
 *     hook 落一枚短命 ticket，本仓不存在该 hook → 这条 ticket 链路在生产上从不被触发。
 *   · init-context-deprecation：本项目从未引入 init-context（related_files 走 add-context CSV），概念被废弃/不引入。
 *   以上三项属老仓亦未实现的空占位，本次移植同样不实现（仅 route-context 的路由引擎是真实现）。
 *
 * kernel 零第三方依赖（本文件为纯字符串逻辑，连 node:fs 都不用；fs 面全在 CLI 注入）。
 */

// === change 名校验（老仓 validate_change_name state-lib.sh:11-25）===
export interface ValidName {
  ok: true
}
export interface InvalidName {
  ok: false
  error: string
}

/** 空 → 「不能为空」；非 [a-zA-Z0-9_-] → 「非法字符」（`.` 不在字符集，`..` 路径穿越被字符集先挡）。 */
export function validateChangeName(name: string | undefined): ValidName | InvalidName {
  if (name === undefined || name === '') {
    return { ok: false, error: 'ERROR: change-name 不能为空' }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { ok: false, error: `ERROR: change-name 非法字符: '${name}' (仅允许 a-z A-Z 0-9 - _)` }
  }
  return { ok: true }
}

// === related_files 读取（老仓 _related_read state-session.sh:109-115：空/"null" → 空，CSV → 成员）===
/** 老仓 CSV 标量存储 + 新仓 list 存储双兼容；"null"/空/undefined → []；trim + 去空。 */
export function relatedFilesFromField(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const parts = Array.isArray(value) ? value : value.trim() === '' || value.trim() === 'null' ? [] : value.split(',')
  return parts.map((s) => s.trim()).filter((s) => s !== '')
}

// === package 声明（老仓 .pipeline-project.yaml packages 节，monorepo.py get_packages）===
export interface PackageDecl {
  name: string
  /** 声明的子树根路径（老仓 cfg.get("path", name)：无 path 子键 → 默认取包名） */
  path: string
}

const INDENT_OF = (line: string): number => line.length - line.replace(/^ +/, '').length

/**
 * 窄解析 .pipeline-project.yaml 的 packages 节（老仓 monorepo.py get_packages:109-121 口径）：
 *   · 无顶层 `packages:` 块（或其带内联标量值）→ null（单仓默认分支）；
 *   · 仅「map 值 entry」计入（`  name:` 后跟更深缩进子块）；内联标量 entry（`  foo: bar`）过滤；
 *   · path = 子键 `path:` 值，缺省取包名（老仓 cfg.get("path", name)）；
 *   · 过滤后无有效包 → null。
 * 仅支持老仓/本项目实际使用的 2 空格缩进子集（禁引入通用 YAML；kernel 零第三方依赖）。
 */
export function parseProjectPackages(yamlText: string): PackageDecl[] | null {
  const lines = yamlText.split('\n')
  let i = 0
  // 定位顶层 packages: （indent 0）
  for (; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (INDENT_OF(line) !== 0) continue
    const m = /^packages:\s*(.*)$/.exec(line)
    if (!m) continue
    const inline = (m[1] ?? '').replace(/\s+#.*$/, '').trim()
    if (inline !== '') return null // 内联标量值（非 map）→ 单仓
    break
  }
  if (i >= lines.length) return null
  // 收集 packages 块：后续 indent>0 的行，遇 indent 0 非空非注释行终止
  const block: string[] = []
  for (i++; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (INDENT_OF(line) === 0) break
    block.push(line)
  }
  if (block.length === 0) return null
  const entryIndent = INDENT_OF(block[0] ?? '')
  const decls: PackageDecl[] = []
  for (let j = 0; j < block.length; j++) {
    const line = block[j] ?? ''
    if (INDENT_OF(line) !== entryIndent) continue
    const em = /^\s*([^:\s][^:]*):\s*(.*)$/.exec(line)
    if (!em) continue
    const name = (em[1] ?? '').trim()
    const inline = (em[2] ?? '').replace(/\s+#.*$/, '').trim()
    if (inline !== '') continue // 内联标量 entry（非 dict）→ 过滤（老仓 get_packages 只留 dict 值）
    // map entry：扫子块找 path 子键（indent > entryIndent，至下一个 entryIndent 行止）
    let pkgPath = name
    for (let k = j + 1; k < block.length; k++) {
      const child = block[k] ?? ''
      if (INDENT_OF(child) <= entryIndent) break
      const pm = /^\s*path:\s*(.*)$/.exec(child)
      if (pm) {
        pkgPath = (pm[1] ?? '').replace(/\s+#.*$/, '').trim() || name
        break
      }
    }
    decls.push({ name, path: pkgPath })
  }
  return decls.length > 0 ? decls : null
}

// === 路由引擎（老仓 monorepo.py，纯字符串——此处真实现）===

/** 归一为 POSIX 相对形（老仓 _normalize_rel_path:207-219）：\\→/、去前导 ./、去末尾 /（根除外）。 */
export function normalizeRelPath(p: string): string {
  let s = String(p).replace(/\\/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

/** path 是否在 base 子树内（老仓 _path_in_subtree:220-230）：== base 或 base/ 下（防前缀误判）。 */
export function pathInSubtree(pathN: string, baseN: string): boolean {
  if (pathN === baseN) return true
  return pathN.startsWith(baseN + '/')
}

/**
 * 把一个路径路由到归属包名（老仓 package_for_path:233-257）：
 * 单仓（packages=null）→ null；多包命中取声明 path 最长者（最具体子树赢）；无命中 → null（不塞 default）。
 */
export function packageForPath(filePath: string, packages: readonly PackageDecl[] | null): string | null {
  if (packages === null) return null
  const norm = normalizeRelPath(filePath)
  let bestName: string | null = null
  let bestLen = -1
  for (const pkg of packages) {
    const base = normalizeRelPath(pkg.path || pkg.name)
    if (base === '') continue
    if (pathInSubtree(norm, base) && base.length > bestLen) {
      bestName = pkg.name
      bestLen = base.length
    }
  }
  return bestName
}

/** 路由桶（package=null 表未归属；老仓 route_paths 的 None 桶）。 */
export interface RouteBucket {
  package: string | null
  paths: string[]
}

/**
 * 批量路由（老仓 route_paths:260-269）：按入参序追加到「首见包」桶，未归属（含单仓全部）落 null 桶。
 * 桶顺序 = 首见包顺序（可复现的 per-package 变更分组）。
 */
export function routeContext(
  paths: readonly string[],
  packages: readonly PackageDecl[] | null,
): RouteBucket[] {
  const order: (string | null)[] = []
  const map = new Map<string | null, string[]>()
  for (const p of paths) {
    const pkg = packageForPath(p, packages)
    let bucket = map.get(pkg)
    if (bucket === undefined) {
      bucket = []
      map.set(pkg, bucket)
      order.push(pkg)
    }
    bucket.push(p)
  }
  return order.map((pkg) => ({ package: pkg, paths: map.get(pkg) ?? [] }))
}

/** 桶 → JSON 对象（老仓 route-paths CLI:877-878：None 桶键序列化为 "null"，保插入序）。 */
export function routeBucketsToObject(buckets: readonly RouteBucket[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const b of buckets) out[b.package === null ? 'null' : b.package] = b.paths
  return out
}

/**
 * 渲染人读分组（老仓 cmd_route_context 内联 python state-session.sh:218-234）：
 *   首行 header；空 obj → 「未配置」提示；否则按键排序（null 桶排最后 + 其余字典序）逐包 [label] + 缩进路径。
 */
export function renderRouteContextText(name: string, obj: Record<string, string[]>): string[] {
  const lines = [`[ROUTE-CONTEXT] ${name} related_files 按 package 归属：`]
  const keys = Object.keys(obj)
  if (keys.length === 0) {
    lines.push('  (no related files / 未配置 package — 全未归属)')
    return lines
  }
  // 老仓 sorted(key=lambda k: (k == "null", k))：null 桶排最后，其余字典序。
  keys.sort((a, b) => {
    const na = a === 'null' ? 1 : 0
    const nb = b === 'null' ? 1 : 0
    if (na !== nb) return na - nb
    return a < b ? -1 : a > b ? 1 : 0
  })
  for (const k of keys) {
    const label = k === 'null' ? '(未归属)' : k
    lines.push(`  [${label}]`)
    for (const p of obj[k] ?? []) lines.push(`    - ${p}`)
  }
  return lines
}
