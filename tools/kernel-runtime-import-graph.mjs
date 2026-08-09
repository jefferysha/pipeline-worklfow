#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const JAVASCRIPT_TO_TYPESCRIPT = new Map([
  ['.js', '.ts'],
  ['.jsx', '.tsx'],
  ['.mjs', '.mts'],
  ['.cjs', '.cts'],
])

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function posixPath(path) {
  return path.split(sep).join('/')
}

function productionSource(path) {
  const base = path.split(sep).at(-1) ?? ''
  if (!SOURCE_EXTENSIONS.has(extname(base)) || /\.d\.(?:ts|tsx|mts|cts)$/u.test(base)) return false
  if (/\.(?:test|node-test)\.[^.]+$/u.test(base) || /\.integration\.test\.[^.]+$/u.test(base)) return false
  const segments = path.split(sep)
  return !segments.includes('fixtures') && !segments.includes('test-fixtures')
}

function collectProductionFiles(rootDir, sourceRoot) {
  const absoluteRoot = resolve(rootDir, sourceRoot)
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && productionSource(path)) files.push(path)
    }
  }
  walk(absoluteRoot)
  return files.sort((a, b) => compareText(posixPath(a), posixPath(b)))
}

function sourceKind(path) {
  const extension = extname(path)
  if (extension === '.tsx') return ts.ScriptKind.TSX
  if (extension === '.mts') return ts.ScriptKind.MTS
  if (extension === '.cts') return ts.ScriptKind.CTS
  return ts.ScriptKind.TS
}

function sourceSpecifier(node) {
  return node !== undefined
    && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined
}

function namedBindingsAreTypeOnly(bindings) {
  return bindings !== undefined
    && ts.isNamedImports(bindings)
    && bindings.elements.length > 0
    && bindings.elements.every((element) => element.isTypeOnly)
}

function exportClauseIsTypeOnly(clause) {
  return clause !== undefined
    && ts.isNamedExports(clause)
    && clause.elements.length > 0
    && clause.elements.every((element) => element.isTypeOnly)
}

function relativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function candidatePaths(importerPath, specifier) {
  const raw = resolve(dirname(importerPath), specifier)
  const extension = extname(raw)
  const mapped = JAVASCRIPT_TO_TYPESCRIPT.get(extension)
  if (mapped !== undefined) return [`${raw.slice(0, -extension.length)}${mapped}`]
  if (SOURCE_EXTENSIONS.has(extension)) return [raw]
  if (extension !== '') return []
  return [
    `${raw}.ts`, `${raw}.tsx`, `${raw}.mts`, `${raw}.cts`,
    join(raw, 'index.ts'), join(raw, 'index.tsx'), join(raw, 'index.mts'), join(raw, 'index.cts'),
  ]
}

export function resolveProjectImport(importerPath, specifier, sourceSet) {
  if (!relativeSpecifier(specifier)) return undefined
  const candidates = candidatePaths(importerPath, specifier)
    .filter((candidate) => sourceSet.has(candidate))
  if (candidates.length === 0) {
    throw new Error(`cannot resolve project-relative import '${specifier}' from '${posixPath(importerPath)}'`)
  }
  if (candidates.length > 1) {
    throw new Error(
      `ambiguous project-relative import '${specifier}' from '${posixPath(importerPath)}': ${candidates.map(posixPath).join(', ')}`,
    )
  }
  return candidates[0]
}

function collectImports(sourceFile, sourceLabel) {
  const imports = []
  const add = (specifierNode, typeOnly) => {
    const specifier = sourceSpecifier(specifierNode)
    if (specifier !== undefined) imports.push({ specifier, typeOnly })
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      add(node.moduleSpecifier, clause?.isTypeOnly === true || namedBindingsAreTypeOnly(clause?.namedBindings))
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      add(node.moduleSpecifier, node.isTypeOnly === true || exportClauseIsTypeOnly(node.exportClause))
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      if (ts.isExternalModuleReference(reference) && reference.expression !== undefined) {
        add(reference.expression, node.isTypeOnly === true)
      }
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (sourceSpecifier(node.arguments[0]) === undefined) {
        throw new Error(`non-literal dynamic import in ${sourceLabel}`)
      }
      add(node.arguments[0], false)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return imports
}

function edgeKey(edge) {
  return `${edge.from}\u0000${edge.to}`
}

function sortedEdges(edges) {
  return [...edges].sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to))
}

function cycleComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]))
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to)
  for (const values of adjacency.values()) values.sort(compareText)
  const indexByNode = new Map()
  const lowLink = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  let index = 0
  const visit = (node) => {
    indexByNode.set(node, index)
    lowLink.set(node, index)
    index += 1
    stack.push(node)
    onStack.add(node)
    for (const next of adjacency.get(node) ?? []) {
      if (!indexByNode.has(next)) {
        visit(next)
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(next)))
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node), indexByNode.get(next)))
      }
    }
    if (lowLink.get(node) !== indexByNode.get(node)) return
    const component = []
    let member
    do {
      member = stack.pop()
      if (member !== undefined) {
        onStack.delete(member)
        component.push(member)
      }
    } while (member !== node)
    component.sort(compareText)
    if (component.length > 1 || (component.length === 1 && (adjacency.get(component[0]) ?? []).includes(component[0]))) {
      components.push(component)
    }
  }
  for (const node of [...nodes].sort(compareText)) {
    if (!indexByNode.has(node)) visit(node)
  }
  return components.sort((a, b) => compareText(a[0], b[0]))
}

function graphFromFiles(rootDir, files) {
  const absoluteFiles = files.map((path) => resolve(path)).sort((a, b) => compareText(posixPath(a), posixPath(b)))
  const sourceSet = new Set(absoluteFiles)
  const nodes = absoluteFiles.map((path) => posixPath(relative(rootDir, path)))
  const pathByNode = new Map(absoluteFiles.map((path) => [path, posixPath(relative(rootDir, path))]))
  const runtime = new Map()
  const typeOnly = new Map()
  for (const importerPath of absoluteFiles) {
    const importer = pathByNode.get(importerPath)
    if (importer === undefined) continue
    const sourceFile = ts.createSourceFile(
      importerPath,
      readFileSync(importerPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      sourceKind(importerPath),
    )
    for (const entry of collectImports(sourceFile, importer)) {
      const resolvedPath = resolveProjectImport(importerPath, entry.specifier, sourceSet)
      if (resolvedPath === undefined) continue
      const target = pathByNode.get(resolvedPath)
      if (target === undefined) throw new Error(`resolved import is outside production source set: ${entry.specifier}`)
      const edge = { from: importer, to: target }
      const map = entry.typeOnly ? typeOnly : runtime
      const key = edgeKey(edge)
      if (!map.has(key)) map.set(key, edge)
    }
  }
  const runtimeEdges = sortedEdges(runtime.values())
  const typeOnlyEdges = sortedEdges(typeOnly.values())
  return {
    files: nodes,
    runtimeEdges,
    typeOnlyEdges,
    runtimeSccs: cycleComponents(nodes, runtimeEdges),
    typeOnlySccs: cycleComponents(nodes, typeOnlyEdges),
  }
}

export async function analyzeImportGraph({ rootDir = fileURLToPath(new URL('..', import.meta.url)), sourceRoot = 'packages/kernel/src' } = {}) {
  const absoluteRoot = resolve(rootDir)
  const files = collectProductionFiles(absoluteRoot, sourceRoot)
  return graphFromFiles(absoluteRoot, files)
}

export function assertNoRuntimeCycles(graph) {
  if (graph.runtimeSccs.length === 0) return
  const details = graph.runtimeSccs.map((members) => {
    const memberSet = new Set(members)
    const edges = graph.runtimeEdges
      .filter((edge) => memberSet.has(edge.from) && memberSet.has(edge.to))
      .map((edge) => `${edge.from} -> ${edge.to}`)
    return `[${members.join(', ')}] edges: ${edges.join('; ')}`
  })
  throw new Error(`kernel runtime import graph failed: runtime SCC=${graph.runtimeSccs.length}; ${details.join(' | ')}`)
}

export function formatImportGraphReport(graph) {
  return `kernel runtime import graph: files=${graph.files.length}; runtime edges=${graph.runtimeEdges.length}; runtime SCC=${graph.runtimeSccs.length}; type-only edges=${graph.typeOnlyEdges.length}; type-only SCC=${graph.typeOnlySccs.length}`
}

async function main() {
  const rootDir = fileURLToPath(new URL('..', import.meta.url))
  const graph = await analyzeImportGraph({ rootDir })
  console.log(formatImportGraphReport(graph))
  assertNoRuntimeCycles(graph)
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
