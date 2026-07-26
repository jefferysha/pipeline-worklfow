#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAX_OFFICIAL_IMAGE_BYTES = 500 * 1024
const OFFICIAL_IMAGE = /^docs-site\/public\/images\/dashboard-[a-z0-9-]+\.webp$/
const FORBIDDEN_TRACKED = [
  /^design-demos\/shots\//,
  /^workflow-governance-(?:desktop|mobile|mobile-dark)\.png$/,
  /^\.playwright-(?:tmp|mcp)\//,
  /^e2e-runs\//,
]
const FORBIDDEN_REFERENCE_IDENTITIES = [
  String.fromCharCode(116, 114, 101, 108, 108, 105, 115),
  String.fromCharCode(99, 111, 109, 101, 116),
]

function posixPath(path) {
  return path.split('\\').join('/')
}

export function checkTrackedFiles(root, tracked) {
  const failures = []
  for (const file of tracked) {
    const rel = posixPath(file)
    if (FORBIDDEN_TRACKED.some((pattern) => pattern.test(rel))) {
      failures.push(`禁止跟踪可再生或本机运行资产: ${rel}`)
      continue
    }
    const extension = extname(rel).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(extension)) continue
    if (!OFFICIAL_IMAGE.test(rel)) {
      failures.push(`图片不在正式文档 allowlist: ${rel}`)
      continue
    }
    const bytes = statSync(join(root, rel)).size
    if (bytes > MAX_OFFICIAL_IMAGE_BYTES) {
      failures.push(`正式文档图超过 500 KiB: ${rel} (${bytes} bytes)`)
    }
  }
  return failures
}

function matchingReferenceIdentity(value) {
  const normalized = value.toLowerCase()
  return FORBIDDEN_REFERENCE_IDENTITIES.find((identity) => normalized.includes(identity))
}

function redactReferenceIdentity(value) {
  let redacted = value
  for (const identity of FORBIDDEN_REFERENCE_IDENTITIES) {
    redacted = redacted.replace(new RegExp(identity, 'gi'), '[reference-identity]')
  }
  return redacted
}

export function checkReferenceIdentities(root, tracked) {
  const failures = []
  for (const file of tracked) {
    const rel = posixPath(file)
    if (matchingReferenceIdentity(rel)) {
      failures.push(`受管理路径包含外部参考项目身份: ${redactReferenceIdentity(rel)}`)
    }
    const absolute = join(root, rel)
    if (!existsSync(absolute) || statSync(absolute).isDirectory()) continue
    const bytes = readFileSync(absolute)
    if (bytes.includes(0)) continue
    if (matchingReferenceIdentity(bytes.toString('utf8'))) {
      failures.push(`受管理文本包含外部参考项目身份: ${redactReferenceIdentity(rel)}`)
    }
  }
  return failures
}

function localImageTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const target = match[1]
    if (target && !/^(?:https?:|data:|#)/i.test(target)) targets.push(target.split('#', 1)[0])
  }
  return targets
}

export function checkMarkdownImages(root, markdownFiles) {
  const failures = []
  for (const rel of markdownFiles) {
    const source = join(root, rel)
    if (!existsSync(source)) continue
    const markdown = readFileSync(source, 'utf8')
    for (const target of localImageTargets(markdown)) {
      const decoded = decodeURIComponent(target)
      const absolute = decoded.startsWith('/images/')
        ? join(root, 'docs-site', 'public', decoded)
        : resolve(dirname(source), decoded)
      const repoRelative = posixPath(relative(root, normalize(absolute)))
      if (!existsSync(absolute)) failures.push(`Markdown 图片不存在: ${rel} -> ${target}`)
      else if (extname(absolute).toLowerCase() !== '.svg' && !OFFICIAL_IMAGE.test(repoRelative)) {
        failures.push(`Markdown 引用了非正式图片资产: ${rel} -> ${repoRelative}`)
      }
    }
  }
  return failures
}

function gitTracked(root) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git ls-files failed')
  // `git ls-files` 仍会列出工作树中已删除、尚未 stage 的索引项；仓库卫生门检查的是
  // 即将交付的当前文件树，删除中的历史路径不应在提交前制造假阳性。
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => existsSync(join(root, file)))
}

export function checkRepository(root = DEFAULT_ROOT) {
  const tracked = gitTracked(root)
  const markdownFiles = tracked.filter((file) =>
    file === 'README.md'
    || file === 'README.en.md'
    || file.startsWith('docs/usage/zh-CN/'),
  )
  return [
    ...checkTrackedFiles(root, tracked),
    ...checkReferenceIdentities(root, tracked),
    ...checkMarkdownImages(root, markdownFiles),
  ]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkRepository()
  if (failures.length > 0) {
    process.stderr.write(`[repository-hygiene] FAIL (${failures.length})\n${failures.map((item) => `- ${item}`).join('\n')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write('[repository-hygiene] PASS\n')
  }
}
