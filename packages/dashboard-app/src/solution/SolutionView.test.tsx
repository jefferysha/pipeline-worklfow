import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { I18nProvider } from '../i18n'
import { SolutionView } from './SolutionView'

function renderSolution(lang: 'zh' | 'en' = 'zh'): void {
  localStorage.setItem('pipeline-dashboard-lang', lang)
  render(
    <I18nProvider>
      <SolutionView />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('SolutionView 开源产品概览', () => {
  it('以单一 h1 和完整 adoption 路径呈现产品，不伪造运行状态', () => {
    renderSolution()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('让 coding agents 按可验证流程交付')
    for (const heading of ['选择正确的执行路径', '默认七阶段', '可追溯的证据链', '一个插件，完整控制面', '明确选择安装宿主', '本地优先的安全边界', '从这里继续']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.queryByText(/当前.*运行|live status/i)).toBeNull()
  })

  it('如实呈现五种模式、七阶段回退和五步证据链', () => {
    renderSolution()

    const modes = within(screen.getByTestId('solution-modes')).getAllByRole('article')
    expect(modes).toHaveLength(5)
    expect(screen.getByTestId('solution-mode-discussion')).toHaveTextContent('不创建 Change')
    expect(screen.getByTestId('solution-mode-discussion')).not.toHaveTextContent('调研')
    expect(screen.getByTestId('solution-mode-simple')).toHaveTextContent('change ⇄ verify → done')
    expect(screen.getByTestId('solution-mode-simple')).toHaveTextContent('scope-expanded → escalated')
    expect(screen.getByTestId('solution-mode-simple')).toHaveTextContent('不继承默认 OpenSpec')
    expect(screen.getByTestId('solution-mode-default')).toHaveTextContent('完整七阶段')
    expect(screen.getByTestId('solution-mode-free')).toHaveTextContent('保留所选 Workflow 的结构与门禁')
    expect(screen.getByTestId('solution-mode-custom')).toHaveTextContent('只治理声明的文档契约')

    const workflow = screen.getByTestId('solution-workflow')
    expect(within(workflow).getAllByRole('listitem')).toHaveLength(7)
    for (const phase of ['立项', '调研', '规格', '实现', '验证', '交付', '归档']) {
      expect(within(workflow).getByText(phase)).toBeInTheDocument()
    }
    expect(workflow).toHaveTextContent('需求变化：实现 → 规格')
    expect(workflow).toHaveTextContent('验证失败：验证 → 实现')
    expect(workflow).toHaveTextContent('调研、规格、验证出口需要精确复核收据')

    expect(within(screen.getByTestId('solution-evidence')).getAllByRole('listitem')).toHaveLength(5)
    for (const evidence of ['Skill 访问', '文档摘要', '读取收据', '复核收据', '状态转换']) {
      expect(screen.getByText(evidence)).toBeInTheDocument()
    }
  })

  it('覆盖公共模块、安装边界、主机能力分级和可选前置条件', () => {
    renderSolution()

    expect(within(screen.getByTestId('solution-modules')).getAllByRole('article')).toHaveLength(6)
    for (const module of ['CLI 与路由', '状态与 Workflow', 'Dashboard', 'Adapters 与 Hooks', 'AFK 与 Loops', '高级诊断']) {
      expect(screen.getByRole('heading', { name: module })).toBeInTheDocument()
    }

    const install = screen.getByTestId('solution-install')
    expect(install).toHaveTextContent('Node.js 22+')
    expect(install).toHaveTextContent('pipeline setup --codex')
    expect(install).toHaveTextContent('pipeline setup --claude')
    expect(install).toHaveTextContent('127.0.0.1:18765')
    expect(install).toHaveTextContent('Codex hooks 需要一次显式信任')
    expect(screen.getByTestId('solution-tier-a')).toHaveTextContent('原生注入、阻断和追踪')
    expect(screen.getByTestId('solution-tier-b')).toHaveTextContent('混合能力')
    expect(screen.getByTestId('solution-tier-c')).toHaveTextContent('静态或降级')
    expect(screen.getByTestId('solution-optional')).toHaveTextContent('Docker 与 agent 凭据只在 AFK 执行时需要')
  })

  it('英文内容结构等价，所有外部链接使用安全属性', () => {
    renderSolution('en')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ship with coding agents through a verifiable workflow')
    expect(screen.getByRole('heading', { name: 'Choose the right execution path' })).toBeInTheDocument()
    expect(screen.getByTestId('solution-mode-free')).toHaveTextContent('keeps the selected Workflow structure and gates')
    expect(screen.getByTestId('solution-mode-discussion')).not.toHaveTextContent('research')
    expect(screen.getByTestId('solution-mode-simple')).toHaveTextContent('scope-expanded → escalated')
    expect(screen.getByTestId('solution-optional')).toHaveTextContent('Docker and agent credentials are only required for AFK execution')

    const links = within(screen.getByTestId('solution-community')).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(6)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
      expect(link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/jefferysha\/pipeline-worklfow/)
    }
  })

  it('是纯展示域：组件自身不发请求，生产文件不反向导入 API 或运营功能域', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderSolution()
    expect(fetchMock).not.toHaveBeenCalled()

    const dir = dirname(fileURLToPath(import.meta.url))
    const production = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    for (const name of production) {
      const source = readFileSync(join(dir, name), 'utf8')
      expect(source, name).not.toMatch(/from ['"]\.\.\/(?:api|state|progress|afk|workbench|machine|model)\//)
    }
  })

  it('所有 section eyebrow 均通过 i18n，链接支持 reduced motion', () => {
    renderSolution()

    expect(screen.getByText('本地优先的 Agent 交付控制面')).toHaveClass('max-w-full', 'shrink', 'whitespace-normal')
    for (const eyebrow of ['路由', '治理', '证明', '运行', '安装', '信任', '社区']) {
      expect(screen.getByText(new RegExp(`· ${eyebrow}$`))).toBeInTheDocument()
    }
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('motion-reduce:transition-none')
    }
  })
})
