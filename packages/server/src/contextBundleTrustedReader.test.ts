import { closeSync, lstatSync, openSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
  LedgerContextBundleError,
} from '@tenon/kernel'
import {
  captureWorkflowRootAnchor,
  closeWorkflowRootAnchor,
  traversableDirectoryFdPathFromCandidates,
} from './workflowRootAnchor.js'
import {
  readBounded,
  trustedContextBundleCurrentPhase,
  trustedContextBundleInputs,
} from './contextBundleTrustedReader.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Context Bundle trusted reader', () => {
  it('canonical current 缺失时返回 STATE_CORRUPT，而不是把持久化损坏分类成请求错误', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-state-missing-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(changeDir, { recursive: true })
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleCurrentPhase(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把每次 Change lookup 绑定到请求开始捕获的 inode，普通目录换位也 fail closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-reader-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(changeDir, { recursive: true })
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    const parked = `${changeDir}.parked`
    await rename(changeDir, parked)
    await mkdir(changeDir)
    await writeFile(
      join(changeDir, '.pipeline-documents.json'),
      '{"version":1,"contract":"openspec-v1","createdAt":"now","records":[]}',
      'utf8',
    )

    try {
      expect(() => trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('即使预检查 size 已过期，也只从 fd 读取 maxBytes + 1', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-bounded-read-'))
    roots.push(root)
    const path = join(root, 'growing.md')
    await writeFile(path, 'x'.repeat(1024 * 1024), 'utf8')
    const fd = openSync(path, 'r')
    try {
      expect(readBounded(fd, 32)).toHaveLength(33)
    } finally {
      closeSync(fd)
    }
  })

  it('运行平台没有任何可遍历 fd path candidate 时返回 unavailable capability', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-no-fd-path-'))
    roots.push(root)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(traversableDirectoryFdPathFromCandidates(anchor, [
        '/definitely-unavailable/fd-path',
      ])).toBeUndefined()
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把超过 16 MiB transport cap 的 ledger 映射为稳定 LEDGER_MISSING', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-ledger-cap-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(changeDir, { recursive: true })
    const ledger = join(changeDir, '.pipeline-documents.json')
    await writeFile(ledger, '{}', 'utf8')
    await truncate(ledger, 16 * 1024 * 1024 + 1)
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把 malformed ledger 映射为稳定 LEDGER_MISSING，而不是无 code 500', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-ledger-malformed-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(changeDir, { recursive: true })
    await writeFile(join(changeDir, '.pipeline-documents.json'), '{broken', 'utf8')
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把非法 UTF-8 ledger 映射为稳定 LEDGER_MISSING，而不是无 code 500', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-ledger-invalid-utf8-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(changeDir, { recursive: true })
    await writeFile(join(changeDir, '.pipeline-documents.json'), Buffer.from([0xff]))
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it.each([
    ['malformed JSON', Buffer.from('{broken', 'utf8')],
    ['invalid UTF-8', Buffer.from([0xff])],
  ])('把 %s canonical current 映射为稳定 STATE_CORRUPT', async (_label, content) => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-state-corrupt-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(join(changeDir, '.pipeline-run'), { recursive: true })
    await writeFile(join(changeDir, '.pipeline-run', 'current.json'), content)
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleCurrentPhase(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('保留合法 UTF-8 BOM，使 server trusted reader 与 CLI readFile 字节语义一致', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-bom-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    const proposal = '\uFEFF# Proposal\n'
    await mkdir(changeDir, { recursive: true })
    await writeFile(join(changeDir, 'proposal.md'), proposal, 'utf8')
    await writeFile(join(changeDir, '.pipeline-documents.json'), JSON.stringify({
      version: 1,
      contract: 'openspec-v1',
      createdAt: '2026-07-28T00:00:00Z',
      records: [],
    }), 'utf8')
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      const inputs = trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )
      const source = await inputs.sourceReader.read(
        'openspec/changes/demo/proposal.md',
        {
          maxBytes: 262_144,
          metric: 'sourceBytesPerDocument',
          limit: 262_144,
          actualOffset: 0,
        },
      )
      expect(source.text.charCodeAt(0)).toBe(0xFEFF)
      expect(source.sourceBytes).toBe(Buffer.byteLength(proposal, 'utf8'))
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把 non-regular canonical current 映射为 STATE_CORRUPT，而不是无 code 500', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-state-nonregular-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(join(changeDir, '.pipeline-run', 'current.json'), { recursive: true })
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleCurrentPhase(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it('把 non-regular ledger 映射为 LEDGER_MISSING，而不是无 code 500', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-context-ledger-nonregular-'))
    roots.push(root)
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    await mkdir(join(changeDir, '.pipeline-documents.json'), { recursive: true })
    const captured = lstatSync(changeDir)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => trustedContextBundleInputs(
        anchor,
        'demo',
        { dev: captured.dev, ino: captured.ino },
        DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
      )).toThrow(expect.objectContaining({
        code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
      }) as LedgerContextBundleError)
    } finally {
      closeWorkflowRootAnchor(anchor)
    }
  })

  it.skipIf(process.platform === 'win32')(
    'FIFO canonical current 非阻塞地映射为 STATE_CORRUPT',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tenon-context-state-fifo-'))
      roots.push(root)
      const changeDir = join(root, 'openspec', 'changes', 'demo')
      const current = join(changeDir, '.pipeline-run', 'current.json')
      await mkdir(join(changeDir, '.pipeline-run'), { recursive: true })
      execFileSync('mkfifo', [current])
      const captured = lstatSync(changeDir)
      const anchor = captureWorkflowRootAnchor(root)
      try {
        expect(() => trustedContextBundleCurrentPhase(
          anchor,
          'demo',
          { dev: captured.dev, ino: captured.ino },
        )).toThrow(expect.objectContaining({
          code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
        }) as LedgerContextBundleError)
      } finally {
        closeWorkflowRootAnchor(anchor)
      }
    },
  )

  it.skipIf(process.platform === 'win32')(
    'FIFO ledger 非阻塞地映射为 LEDGER_MISSING',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tenon-context-ledger-fifo-'))
      roots.push(root)
      const changeDir = join(root, 'openspec', 'changes', 'demo')
      const ledger = join(changeDir, '.pipeline-documents.json')
      await mkdir(changeDir, { recursive: true })
      execFileSync('mkfifo', [ledger])
      const captured = lstatSync(changeDir)
      const anchor = captureWorkflowRootAnchor(root)
      try {
        expect(() => trustedContextBundleInputs(
          anchor,
          'demo',
          { dev: captured.dev, ino: captured.ino },
          DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
        )).toThrow(expect.objectContaining({
          code: 'CONTEXT_BUNDLE_LEDGER_MISSING',
        }) as LedgerContextBundleError)
      } finally {
        closeWorkflowRootAnchor(anchor)
      }
    },
  )

  it.skipIf(process.platform === 'win32')(
    'canonical current symlink 被视为 STATE_CORRUPT，而不是缺失 state',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tenon-context-state-symlink-'))
      roots.push(root)
      const changeDir = join(root, 'openspec', 'changes', 'demo')
      const runDir = join(changeDir, '.pipeline-run')
      const target = join(changeDir, 'outside-current.json')
      await mkdir(runDir, { recursive: true })
      await writeFile(target, '{}', 'utf8')
      await symlink(target, join(runDir, 'current.json'))
      const captured = lstatSync(changeDir)
      const anchor = captureWorkflowRootAnchor(root)
      try {
        expect(() => trustedContextBundleCurrentPhase(
          anchor,
          'demo',
          { dev: captured.dev, ino: captured.ino },
        )).toThrow(expect.objectContaining({
          code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
        }) as LedgerContextBundleError)
      } finally {
        closeWorkflowRootAnchor(anchor)
      }
    },
  )
})
