#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  analyzeImportGraph,
  assertNoRuntimeCycles,
} from './kernel-runtime-import-graph.mjs'

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'tenon-kernel-import-graph-'))
  const sourceRoot = join(root, 'packages', 'kernel', 'src')
  await mkdir(sourceRoot, { recursive: true })
  for (const [name, source] of Object.entries(files)) {
    const path = join(sourceRoot, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, source, 'utf8')
  }
  return root
}

test('runtime cycles are reported and rejected, including dynamic import and export star edges', async () => {
  const root = await fixture({
    'a.ts': "import { b } from './b.js'; export const a = b;",
    'b.ts': "export * from './c.js'; export const b = 1;",
    'c.ts': "export const c = import('./a.js');",
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.equal(graph.runtimeSccs.length, 1)
  assert.deepEqual(graph.runtimeSccs[0], [
    'packages/kernel/src/a.ts',
    'packages/kernel/src/b.ts',
    'packages/kernel/src/c.ts',
  ])
  assert.throws(() => assertNoRuntimeCycles(graph), /runtime SCC=1/u)
  const repeated = await analyzeImportGraph({ rootDir: root })
  assert.deepEqual(repeated, graph)
})

test('type-only cycles are reported separately and do not block runtime graph', async () => {
  const root = await fixture({
    'a.ts': "import type { B } from './b'; export type A = B;",
    'b.ts': "export type { A } from './a';",
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.equal(graph.runtimeSccs.length, 0)
  assert.deepEqual(graph.typeOnlySccs, [[
    'packages/kernel/src/a.ts',
    'packages/kernel/src/b.ts',
  ]])
  assertNoRuntimeCycles(graph)
})

test('mixed named imports remain runtime edges', async () => {
  const root = await fixture({
    'a.ts': "import { type BType, b } from './b'; export const a = b as BType;",
    'b.ts': "import { a } from './a'; export const b = a; export type BType = number;",
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.equal(graph.runtimeSccs.length, 1)
  assert.equal(graph.typeOnlyEdges.length, 0)
})

test('type-only import equals declarations remain outside the runtime graph', async () => {
  const root = await fixture({
    'a.ts': "import type Foo = require('./foo'); export type A = Foo;",
    'foo.ts': 'export interface Foo { readonly value: string }',
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.equal(graph.runtimeEdges.length, 0)
  assert.deepEqual(graph.typeOnlyEdges, [{
    from: 'packages/kernel/src/a.ts',
    to: 'packages/kernel/src/foo.ts',
  }])
})

test('default, namespace, side-effect, and ImportTypeNode semantics are explicit', async () => {
  const runtimeRoot = await fixture({
    'a.ts': "import value from './b'; import * as ns from './b'; import './b'; export const a = value + ns.b;",
    'b.ts': "import { a } from './a'; export default a; export const b = a;",
  })
  const runtime = await analyzeImportGraph({ rootDir: runtimeRoot })
  assert.equal(runtime.runtimeSccs.length, 1)
  const typeRoot = await fixture({
    'a.ts': "export type A = import('./b').B;",
    'b.ts': "export type B = import('./a').A;",
  })
  const typeOnly = await analyzeImportGraph({ rootDir: typeRoot })
  assert.equal(typeOnly.runtimeSccs.length, 0)
  assert.deepEqual(typeOnly.typeOnlySccs, [[
    'packages/kernel/src/a.ts',
    'packages/kernel/src/b.ts',
  ]])
})

test('resolution maps JavaScript and extensionless index specifiers deterministically', async () => {
  const root = await fixture({
    'a.ts': "import { b } from './nested'; export const a = b;",
    'js.ts': "import { b } from './nested/index.js'; export const js = b;",
    'nested/index.ts': 'export const b = 1;',
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.deepEqual(graph.runtimeEdges, [
    { from: 'packages/kernel/src/a.ts', to: 'packages/kernel/src/nested/index.ts' },
    { from: 'packages/kernel/src/js.ts', to: 'packages/kernel/src/nested/index.ts' },
  ])
})

test('runtime self-imports are rejected as one-node SCCs', async () => {
  const root = await fixture({
    'self.ts': "import { value } from './self'; export const self = value; export const value = 1;",
  })
  const graph = await analyzeImportGraph({ rootDir: root })
  assert.deepEqual(graph.runtimeSccs, [['packages/kernel/src/self.ts']])
  assert.throws(() => assertNoRuntimeCycles(graph), /runtime SCC=1/u)
})

test('non-literal dynamic imports fail loudly with a deterministic source', async () => {
  const root = await fixture({
    'a.ts': "const specifier = './b'; export const loaded = import(specifier);",
    'b.ts': 'export const value = 1;',
  })
  await assert.rejects(
    () => analyzeImportGraph({ rootDir: root }),
    /non-literal dynamic import in packages\/kernel\/src\/a\.ts/u,
  )
})

test('unresolved and ambiguous project-relative imports fail loudly', async () => {
  const unresolved = await fixture({
    'a.ts': "import './missing';",
  })
  await assert.rejects(
    () => analyzeImportGraph({ rootDir: unresolved }),
    /cannot resolve project-relative import/u,
  )

  const ambiguous = await fixture({
    'a.ts': "import './b';",
    'b.ts': 'export const b = 1;',
    'b.tsx': 'export const b = 1;',
  })
  await assert.rejects(
    () => analyzeImportGraph({ rootDir: ambiguous }),
    /ambiguous project-relative import/u,
  )
})
