#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const CANONICAL_USAGE_FILES = [
  'README.md',
  'installation.md',
  'quickstart.md',
  'routing-and-workflows.md',
  'default-workflow.md',
  'custom-workflows-and-tracks.md',
  'documents-skills-and-evidence.md',
  'dashboard-and-local-api.md',
  'automation-and-loops.md',
  'advanced-tools.md',
  'updates-recovery-and-uninstall.md',
  'troubleshooting.md',
  'security-model.md',
  'release-notes.md',
  'contributor-development.md',
  'cli-reference.md',
]

const ROOT_DOCUMENTS = [
  'README.md',
  'README.en.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'SUPPORT.md',
]

const TRUTH_SOURCES = [
  'package.json',
  'packages/server/src/port.ts',
  'packages/cli/src/program-install.ts',
  'packages/cli/src/commands/runtime.ts',
  'packages/dashboard-app/src/shell/Nav.tsx',
  'templates/workflows/default.yaml',
  'templates/workflows/simple.yaml',
]

function slash(path) {
  return path.split(sep).join('/')
}

function blankFencedCode(markdown) {
  return markdown.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gmu, (block) =>
    block.replace(/[^\n]/gu, ' '),
  )
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

/** Extract inline and reference-definition Markdown link targets without parsing code fences. */
export function extractMarkdownTargets(markdown) {
  const text = blankFencedCode(markdown)
  const links = []
  const inline = /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)\n]+)(?:\s+["'][^)\n]*["'])?\s*\)/gu
  for (const match of text.matchAll(inline)) {
    links.push({
      target: match[1].startsWith('<') ? match[1].slice(1, -1) : match[1],
      line: lineAt(text, match.index),
    })
  }
  const reference = /^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gmu
  for (const match of text.matchAll(reference)) {
    links.push({
      target: match[1].startsWith('<') ? match[1].slice(1, -1) : match[1],
      line: lineAt(text, match.index),
    })
  }
  return links
}

export function extractYamlStepIds(yaml) {
  return [...yaml.matchAll(/^ {2}- id:\s*([A-Za-z0-9_-]+)\s*$/gmu)].map((match) => match[1])
}

export function extractPrimaryViews(source) {
  const body = source.match(/\bPRIMARY_VIEWS\b[^=]*=\s*\[([^\]]*)\]/u)?.[1]
  if (body === undefined) return []
  return [...body.matchAll(/['"]([A-Za-z0-9_-]+)['"]/gu)].map((match) => match[1])
}

function extractViewUnion(source) {
  const body = source.match(/\bexport\s+type\s+View\s*=\s*([^\n;]+)/u)?.[1]
  if (body === undefined) return []
  return [...body.matchAll(/['"]([A-Za-z0-9_-]+)['"]/gu)].map((match) => match[1])
}

function extractCommandFamilies(source) {
  return new Set(
    [...source.matchAll(/\.command\(\s*['"]([a-z][a-z0-9-]*)[^'"]*['"]/gu)]
      .map((match) => match[1]),
  )
}

function withoutQueryOrFragment(target) {
  const query = target.indexOf('?')
  const fragment = target.indexOf('#')
  const ends = [query, fragment].filter((value) => value >= 0)
  return ends.length === 0 ? target : target.slice(0, Math.min(...ends))
}

function decodedFragment(target) {
  const index = target.indexOf('#')
  if (index < 0) return ''
  try {
    return decodeURIComponent(target.slice(index + 1))
  } catch {
    return ''
  }
}

function markdownHeadingSlugs(markdown) {
  const counts = new Map()
  const slugs = new Set()
  for (const match of blankFencedCode(markdown).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = match[1]
      .replace(/`([^`]+)`/gu, '$1')
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, '-')
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    slugs.add(count === 0 ? base : `${base}-${count}`)
  }
  return slugs
}

function isRemoteOrRuntimeTarget(target) {
  return (
    target === ''
    || target.startsWith('#')
    || target.startsWith('//')
    || target.startsWith('/?')
    || target.startsWith('/#')
    || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)
  )
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function checkLink(root, sourceRelative, link, failures) {
  if (isRemoteOrRuntimeTarget(link.target)) return
  let decoded
  try {
    decoded = decodeURIComponent(withoutQueryOrFragment(link.target))
  } catch {
    failures.push(`${sourceRelative}:${link.line}: invalid encoded Markdown target ${link.target}`)
    return
  }
  if (decoded === '') return
  const rootReal = realpathSync(root)
  const sourceDir = dirname(join(rootReal, sourceRelative))
  const candidate = resolve(decoded.startsWith('/') ? join(rootReal, decoded.slice(1)) : join(sourceDir, decoded))
  if (!isWithin(rootReal, candidate)) {
    failures.push(`${sourceRelative}:${link.line}: Markdown target escapes repository: ${link.target}`)
    return
  }
  if (!existsSync(candidate)) {
    failures.push(`${sourceRelative}:${link.line}: missing Markdown target ${link.target}`)
    return
  }
  const candidateReal = realpathSync(candidate)
  if (!isWithin(rootReal, candidateReal)) {
    failures.push(`${sourceRelative}:${link.line}: Markdown target resolves outside repository: ${link.target}`)
    return
  }
  const fragment = decodedFragment(link.target)
  if (fragment !== '' && lstatSync(candidateReal).isFile() && candidateReal.endsWith('.md')) {
    const headings = markdownHeadingSlugs(readFileSync(candidateReal, 'utf8'))
    if (!headings.has(fragment.toLowerCase())) {
      failures.push(`${sourceRelative}:${link.line}: missing Markdown fragment #${fragment} in ${slash(relative(rootReal, candidateReal))}`)
    }
  }
}

function includesOrderedTokens(text, tokens) {
  let cursor = 0
  const lower = text.toLowerCase()
  for (const token of tokens) {
    const index = lower.indexOf(token.toLowerCase(), cursor)
    if (index < 0) return false
    cursor = index + token.length
  }
  return true
}

function hasNodeMinimum(text, major) {
  const escaped = String(major).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(
    `Node(?:\\.js)?[^\\n]{0,40}(?:>=\\s*${escaped}|≥\\s*${escaped}|${escaped}\\+|${escaped}\\s+or\\s+later|${escaped}\\s*或更高|${escaped}\\s*以上)`,
    'iu',
  ).test(text)
}

function directRelativeTargets(markdown) {
  const targets = new Set()
  for (const link of extractMarkdownTargets(markdown)) {
    if (isRemoteOrRuntimeTarget(link.target)) continue
    let decoded
    try {
      decoded = decodeURIComponent(withoutQueryOrFragment(link.target))
    } catch {
      continue
    }
    if (decoded !== '') targets.add(slash(decoded.replace(/^\.\//u, '')))
  }
  return targets
}

function requiredContent(root, relativePath, failures) {
  const path = join(root, relativePath)
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    failures.push(`${relativePath}: required file is missing`)
    return undefined
  }
  return readFileSync(path, 'utf8')
}

function checkRequiredLinks(document, content, expected, failures) {
  if (content === undefined) return
  const targets = directRelativeTargets(content)
  for (const target of expected) {
    if (!targets.has(target)) failures.push(`${document}: missing required link to ${target}`)
  }
}

function checkSourceBoundedClaims(root, contents, failures) {
  const packageText = contents.get('package.json')
  if (packageText !== undefined) {
    let engine
    try {
      engine = JSON.parse(packageText)?.engines?.node
    } catch {
      failures.push('package.json: invalid JSON while reading engines.node')
    }
    const major = typeof engine === 'string' ? Number(engine.match(/\d+/u)?.[0]) : Number.NaN
    if (!Number.isInteger(major)) {
      failures.push('package.json: engines.node must expose a numeric minimum for documentation')
    } else {
      for (const document of [
        'README.md',
        'README.en.md',
        'docs/usage/installation.md',
        'docs/usage/zh-CN/installation.md',
      ]) {
        const text = contents.get(document)
        if (text !== undefined && !hasNodeMinimum(text, major)) {
          failures.push(`${document}: missing Node.js ${major}+ claim from package.json engines.node`)
        }
      }
    }
  }

  const portSource = contents.get('packages/server/src/port.ts')
  const port = portSource?.match(/\bexport\s+const\s+DEFAULT_DASHBOARD_PORT\s*=\s*(\d+)/u)?.[1]
  if (port === undefined) {
    failures.push('packages/server/src/port.ts: cannot find exported DEFAULT_DASHBOARD_PORT')
  } else {
    for (const document of [
      'README.md',
      'README.en.md',
      'docs/usage/dashboard-and-local-api.md',
      'docs/usage/zh-CN/dashboard-and-local-api.md',
    ]) {
      const text = contents.get(document)
      if (text !== undefined && !new RegExp(`\\b${port}\\b`, 'u').test(text)) {
        failures.push(`${document}: missing production Dashboard port ${port} from packages/server/src/port.ts`)
      }
    }
  }

  const commandSource = contents.get('packages/cli/src/program-install.ts')
  if (commandSource !== undefined) {
    const families = extractCommandFamilies(commandSource)
    const commands = new Map([
      ['setup', 'pipeline setup --codex'],
      ['update', 'pipeline update --codex'],
      ['runtime', 'pipeline runtime status'],
      ['runtime-repair', 'pipeline runtime repair --rollback'],
      ['dashboard', 'pipeline dashboard --open'],
    ])
    for (const family of ['setup', 'update', 'runtime', 'dashboard']) {
      if (!families.has(family)) {
        failures.push(`packages/cli/src/program-install.ts: missing documented ${family} command family`)
      }
    }
    const codexOptions = [...commandSource.matchAll(/\.option\(\s*['"]--codex(?:\s|['"])/gu)].length
    if (codexOptions < 2) {
      failures.push('packages/cli/src/program-install.ts: setup and update must both expose the documented --codex host flag')
    }
    if (!/\.option\(\s*['"]--open(?:\s|['"])/u.test(commandSource)) {
      failures.push('packages/cli/src/program-install.ts: dashboard must expose the documented --open option')
    }
    if (!/\.option\(\s*['"]--rollback(?:\s|['"])/u.test(commandSource)) {
      failures.push('packages/cli/src/program-install.ts: runtime must expose the documented --rollback option')
    }
    const commandDocuments = new Map([
      ['README.md', ['setup', 'dashboard']],
      ['README.en.md', ['setup', 'dashboard']],
      ['docs/usage/installation.md', ['setup']],
      ['docs/usage/updates-recovery-and-uninstall.md', ['update', 'runtime', 'runtime-repair']],
      ['docs/usage/dashboard-and-local-api.md', ['dashboard']],
      ['docs/usage/cli-reference.md', ['setup', 'update', 'runtime', 'runtime-repair', 'dashboard']],
      ['docs/usage/zh-CN/installation.md', ['setup']],
      ['docs/usage/zh-CN/updates-recovery-and-uninstall.md', ['update', 'runtime', 'runtime-repair']],
      ['docs/usage/zh-CN/dashboard-and-local-api.md', ['dashboard']],
      ['docs/usage/zh-CN/cli-reference.md', ['setup', 'update', 'runtime', 'runtime-repair', 'dashboard']],
    ])
    for (const [document, keys] of commandDocuments) {
      const text = contents.get(document)
      if (text === undefined) continue
      for (const key of keys) {
        const command = commands.get(key)
        if (!text.includes(command)) failures.push(`${document}: missing canonical command \`${command}\``)
      }
    }
  }
  const runtimeSource = contents.get('packages/cli/src/commands/runtime.ts')
  if (runtimeSource !== undefined) {
    if (!/sub\s*===\s*['"]status['"]/u.test(runtimeSource)) {
      failures.push('packages/cli/src/commands/runtime.ts: missing documented runtime status subcommand')
    }
    if (!/sub\s*===\s*['"]repair['"]/u.test(runtimeSource) || !/\bopts\.rollback\b/u.test(runtimeSource)) {
      failures.push('packages/cli/src/commands/runtime.ts: missing documented runtime repair --rollback boundary')
    }
  }

  const defaultSteps = extractYamlStepIds(contents.get('templates/workflows/default.yaml') ?? '')
  if (defaultSteps.length === 0) {
    failures.push('templates/workflows/default.yaml: cannot extract top-level workflow steps')
  } else {
    for (const document of ['docs/usage/default-workflow.md', 'docs/usage/zh-CN/default-workflow.md']) {
      const text = contents.get(document)
      if (text !== undefined && !includesOrderedTokens(text, defaultSteps)) {
        failures.push(`${document}: workflow steps must follow source order: ${defaultSteps.join(' -> ')}`)
      }
    }
  }

  const simpleSteps = extractYamlStepIds(contents.get('templates/workflows/simple.yaml') ?? '')
  if (simpleSteps.length === 0) {
    failures.push('templates/workflows/simple.yaml: cannot extract top-level workflow steps')
  } else {
    for (const document of ['docs/usage/routing-and-workflows.md', 'docs/usage/zh-CN/routing-and-workflows.md']) {
      const text = contents.get(document)
      if (text !== undefined) {
        for (const step of simpleSteps) {
          if (!new RegExp(`\\b${step}\\b`, 'iu').test(text)) {
            failures.push(`${document}: simple workflow is missing source step ${step}`)
          }
        }
        const mainPath = simpleSteps.filter((step) => step !== 'escalated')
        if (!includesOrderedTokens(text, mainPath)) {
          failures.push(`${document}: simple workflow main path must follow source order: ${mainPath.join(' -> ')}`)
        }
      }
    }
  }

  const navSource = contents.get('packages/dashboard-app/src/shell/Nav.tsx')
  if (navSource !== undefined) {
    const primaryViews = extractPrimaryViews(navSource)
    const viewUnion = extractViewUnion(navSource)
    if (primaryViews.length !== 5) {
      failures.push(`packages/dashboard-app/src/shell/Nav.tsx: PRIMARY_VIEWS must contain exactly 5 operational views, found ${primaryViews.length}`)
    }
    if (primaryViews.includes('overview')) {
      failures.push('packages/dashboard-app/src/shell/Nav.tsx: overview must remain separate from PRIMARY_VIEWS')
    }
    if (!viewUnion.includes('overview')) {
      failures.push('packages/dashboard-app/src/shell/Nav.tsx: View must include the separate overview view')
    }
    for (const document of ['docs/usage/dashboard-and-local-api.md', 'docs/usage/zh-CN/dashboard-and-local-api.md']) {
      const text = contents.get(document)
      if (text !== undefined) {
        if (!includesOrderedTokens(text, primaryViews)) {
          failures.push(`${document}: operational views must follow PRIMARY_VIEWS source order: ${primaryViews.join(' -> ')}`)
        }
        if (!/\boverview\b/iu.test(text)) failures.push(`${document}: missing separate overview view`)
      }
    }
  }
}

export function checkRepository(rootInput) {
  const root = resolve(rootInput)
  const failures = []
  const contents = new Map()
  const canonicalDocuments = [
    ...ROOT_DOCUMENTS,
    ...CANONICAL_USAGE_FILES.map((file) => `docs/usage/${file}`),
    ...CANONICAL_USAGE_FILES.map((file) =>
      `docs/usage/zh-CN/${file === 'README.md' ? 'index.md' : file}`,
    ),
  ]
  for (const relativePath of [...TRUTH_SOURCES, ...canonicalDocuments]) {
    const content = requiredContent(root, relativePath, failures)
    if (content !== undefined) contents.set(relativePath, content)
  }
  if (!existsSync(join(root, 'LICENSE'))) failures.push('LICENSE: required file is missing')

  for (const document of canonicalDocuments) {
    const markdown = contents.get(document)
    if (markdown === undefined) continue
    for (const link of extractMarkdownTargets(markdown)) {
      checkLink(root, document, link, failures)
    }
  }

  const communityTargets = [
    'docs/usage/README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'SUPPORT.md',
    'LICENSE',
  ]
  checkRequiredLinks(
    'README.md',
    contents.get('README.md'),
    ['README.en.md', ...communityTargets],
    failures,
  )
  checkRequiredLinks(
    'README.en.md',
    contents.get('README.en.md'),
    ['README.md', ...communityTargets],
    failures,
  )
  checkRequiredLinks(
    'README.zh-CN.md',
    contents.get('README.zh-CN.md'),
    ['README.md'],
    failures,
  )
  checkSourceBoundedClaims(root, contents, failures)
  return failures
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const failures = checkRepository(root)
  if (failures.length > 0) {
    console.error(`documentation check failed (${failures.length}):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    const count = ROOT_DOCUMENTS.length + (CANONICAL_USAGE_FILES.length * 2)
    console.log(`documentation check passed (${count} canonical Markdown files; bounded claims and repository-relative links verified)`)
  }
}
