import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentEntries } from '../content-manifest.mjs'

const docsSiteRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = resolve(docsSiteRoot, '..')
const targets = new Set()
const sources = new Set()
const errors = []
const contentTypes = new Set(['tutorial', 'how-to', 'concept', 'reference'])
const requiredHowToHeadings = {
  'zh-CN': ['目标', '前置条件', '预期结果', '验证', '常见失败', '下一步'],
  en: ['Goal', 'Prerequisites', 'Expected result', 'Verification', 'Common failures', 'Next action'],
}

for (const entry of contentEntries) {
  if (!contentTypes.has(entry.contentType)) {
    errors.push(`${entry.slug}: 非法 contentType ${String(entry.contentType)}`)
  }
  for (const locale of ['zh-CN', 'en']) {
    const item = entry.locales[locale]
    if (!item.title || !item.description) errors.push(`${locale}/${entry.slug}: 缺少 title 或 description`)
    if (targets.has(item.target)) errors.push(`重复 target: ${item.target}`)
    targets.add(item.target)
    if (sources.has(item.source)) errors.push(`重复 source: ${item.source}`)
    sources.add(item.source)
    try {
      const body = await readFile(resolve(repoRoot, item.source), 'utf8')
      if (!/^#\s+\S/m.test(body)) errors.push(`${item.source}: 缺少 H1`)
      if (!/\bTenon\b/i.test(body)) errors.push(`${item.source}: 缺少 Tenon 产品上下文`)
      if (entry.contentType === 'how-to' || entry.contentType === 'tutorial') {
        for (const heading of requiredHowToHeadings[locale]) {
          if (!body.includes(`## ${heading}`)) {
            errors.push(`${item.source}: ${entry.contentType} 缺少标准章节 “${heading}”`)
          }
        }
        const headings = [...body.matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1].trim())
        const expectedIndex = headings.indexOf(locale === 'zh-CN' ? '预期结果' : 'Expected result')
        const prerequisitesIndex = headings.indexOf(locale === 'zh-CN' ? '前置条件' : 'Prerequisites')
        if (prerequisitesIndex < 0 || expectedIndex <= prerequisitesIndex + 1) {
          errors.push(`${item.source}: ${entry.contentType} 缺少前置条件与预期结果之间的可执行步骤章节`)
        }
      }
      if (locale === 'zh-CN' && body.split('\n').filter((line) => line.trim()).length < 45) {
        errors.push(`${item.source}: 中文规范页内容过短，至少需要 45 行非空内容`)
      }
    } catch {
      errors.push(`${locale}/${entry.slug}: 缺少 source ${item.source}`)
    }
  }
}

const usageRoot = resolve(repoRoot, 'docs', 'usage')
const usageMarkdown = (await readdir(usageRoot, { recursive: true }).catch(() => []))
  .map(String)
  .filter((file) => file.endsWith('.md'))
  .map((file) => `docs/usage/${file.split(sep).join('/')}`)
for (const source of usageMarkdown) {
  if (!sources.has(source)) errors.push(`${source}: 未登记公开页面；请加入 content-manifest 或移出公开源目录`)
}
for (const source of sources) {
  if (!usageMarkdown.includes(source)) errors.push(`${source}: manifest source 不在 docs/usage 公开源中`)
}

const forbidden = ['/Users/']
const sensitivePatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, '私钥'],
  [/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~-]{20,}/iu, 'Bearer 凭证'],
  [/[?&](?:access_token|api_key|token|secret)=[A-Za-z0-9._~-]{12,}/iu, '查询参数凭证'],
  [/(?:\/home\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/u, '用户目录绝对路径'],
]
try {
  const files = await readdir(resolve(docsSiteRoot, '.generated'), { recursive: true })
  for (const file of files) {
    if (!String(file).endsWith('.md')) continue
    const generatedPath = resolve(docsSiteRoot, '.generated', String(file))
    const body = await readFile(generatedPath, 'utf8')
    for (const marker of forbidden) {
      if (body.includes(marker)) errors.push(`.generated/${file}: 包含禁止公开标记 ${marker}`)
    }
    for (const [pattern, label] of sensitivePatterns) {
      if (pattern.test(body)) errors.push(`.generated/${file}: 包含疑似${label}`)
    }
    for (const match of body.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/gu)) {
      const raw = match[1]
      if (!raw || raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(raw)) continue
      let target
      try {
        target = decodeURIComponent(raw.split(/[?#]/u, 1)[0] ?? '')
      } catch {
        errors.push(`.generated/${file}: 非法链接编码 ${raw}`)
        continue
      }
      if (!target || extname(target) !== '.md') continue
      const absolute = resolve(dirname(generatedPath), target)
      const escaped = relative(resolve(docsSiteRoot, '.generated'), absolute)
      if (escaped === '..' || escaped.startsWith(`..${sep}`)) {
        errors.push(`.generated/${file}: 链接越过公开根 ${raw}`)
        continue
      }
      await access(absolute).catch(() => errors.push(`.generated/${file}: 缺少内部链接目标 ${raw}`))
    }
  }
} catch {
  errors.push('缺少 .generated；先运行 npm run docs:sync')
}

await access(resolve(docsSiteRoot, 'public', 'llms.txt')).catch(() => errors.push('缺少 public/llms.txt'))

try {
  const workflow = await readFile(resolve(repoRoot, '.github/workflows/docs-pages.yml'), 'utf8')
  const requiredWorkflowFragments = [
    'branches: [main]',
    'permissions:\n  contents: read',
    "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'",
    'pages: write',
    'id-token: write',
    'path: docs-site/dist',
  ]
  for (const fragment of requiredWorkflowFragments) {
    if (!workflow.includes(fragment)) errors.push(`docs-pages workflow 缺少受控结构: ${fragment}`)
  }
  if (/push:\s*\n(?:[ \t].*\n)*?[ \t]+branches:\s*\[(?!main\])/u.test(workflow)) {
    errors.push('docs-pages workflow push 分支必须只允许 main')
  }
} catch {
  errors.push('缺少 .github/workflows/docs-pages.yml')
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[docs] ${error}`)
  process.exitCode = 1
} else {
  console.log(`[docs] PASS: ${contentEntries.length} 个双语页面，${targets.size} 个唯一路由`)
}
