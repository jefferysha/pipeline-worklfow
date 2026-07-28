import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { HostTargetPlanClientError } from '../api/hostTargetPlanClient'
import type { HostTargetCatalog, HostTargetPlan } from '../api/hostTargetPlanTypes'
import { HostTargetPlanView } from './HostTargetPlanView'

const catalog: HostTargetCatalog = {
  schema_version: 'host-target-plan/v1',
  targets: [
    {
      id: 'codex',
      kind: 'native',
      cli_flag: '--codex',
      target_scope: 'user',
      supported_operations: ['setup', 'update'],
      capabilities: ['native-marketplace', 'bundled-skills', 'automatic-update'],
    },
    {
      id: 'cursor',
      kind: 'adapter',
      cli_flag: '--cursor',
      target_scope: 'project',
      supported_operations: ['setup', 'update'],
      capabilities: ['project-adapter', 'managed-runtime', 'bundled-skills'],
    },
  ],
}

const setupPlan: HostTargetPlan = {
  schema_version: 'host-target-plan/v1',
  side_effects: 'none',
  host: catalog.targets[0],
  operation: 'setup',
  command: {
    executable: 'tenon',
    args: ['setup', '--codex'],
    display: 'tenon setup --codex',
  },
  steps: [
    { id: 'marketplace-register', label: 'host-plan.step.marketplace-register', command: null },
    {
      id: 'plugin-install',
      label: 'host-plan.step.plugin-install',
      command: {
        executable: 'codex',
        args: ['plugin', 'install', 'tenon'],
        display: 'codex plugin install tenon',
      },
    },
    {
      id: 'codex-auth-status',
      label: 'host-plan.step.codex-auth-status',
      command: {
        executable: 'codex',
        args: ['login', 'status'],
        display: 'codex login status',
      },
    },
  ],
  notices: [
    'host-plan.notice.read-only-generation',
    'host-plan.notice.manual-command-has-effects',
    'host-plan.notice.codex-auth-guidance',
  ],
}

function renderView(over: Partial<Parameters<typeof HostTargetPlanView>[0]> = {}) {
  const props = {
    loadTargets: vi.fn<() => Promise<HostTargetCatalog>>(),
    loadPlan: vi.fn<(host: string, operation: 'setup' | 'update') => Promise<HostTargetPlan>>(),
    copyText: vi.fn<(text: string) => Promise<void>>(),
    ...over,
  }
  render(<I18nProvider><HostTargetPlanView {...props} /></I18nProvider>)
  return props
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('HostTargetPlanView', () => {
  it('announces catalog loading, then renders an honest empty state', async () => {
    let resolveCatalog: ((value: HostTargetCatalog) => void) | undefined
    const loadTargets = vi.fn()
      .mockImplementationOnce(() => new Promise<HostTargetCatalog>((resolve) => {
        resolveCatalog = resolve
      }))
      .mockResolvedValueOnce(catalog)
    renderView({ loadTargets })

    expect(screen.getByRole('status')).toHaveTextContent('正在加载宿主目录')
    resolveCatalog?.({ schema_version: 'host-target-plan/v1', targets: [] })

    expect(await screen.findByTestId('host-plan-empty')).toHaveTextContent('没有可用的宿主目标')
    fireEvent.click(screen.getByRole('button', { name: '重试宿主目录' }))
    expect(await screen.findByRole('button', { name: '选择 Codex' })).toBeInTheDocument()
    expect(loadTargets).toHaveBeenCalledTimes(2)
  })

  it('shows a catalog error and retries without reloading the page', async () => {
    const loadTargets = vi.fn()
      .mockRejectedValueOnce(
        new HostTargetPlanClientError('network', 'HOST_TARGET_NETWORK_ERROR'),
      )
      .mockResolvedValueOnce(catalog)
    renderView({ loadTargets })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法连接本机 Tenon 服务')
    fireEvent.click(screen.getByRole('button', { name: '重试宿主目录' }))

    expect(await screen.findByRole('button', { name: '选择 Codex' })).toBeInTheDocument()
    expect(loadTargets).toHaveBeenCalledTimes(2)
  })

  it('selects a target and operation, announces plan loading, localizes tokens, and clears stale plans', async () => {
    let resolvePlan: ((value: HostTargetPlan) => void) | undefined
    const loadPlan = vi.fn(() => new Promise<HostTargetPlan>((resolve) => {
      resolvePlan = resolve
    }))
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan,
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    const nativeCard = screen.getByRole('heading', { name: 'Codex' }).closest('article')
    if (!nativeCard) throw new Error('Codex card missing')
    expect(within(nativeCard).getByText('用户范围')).toBeInTheDocument()
    expect(within(nativeCard).getByText('原生 marketplace')).toBeInTheDocument()
    expect(within(nativeCard).getByText('内置 Skills')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('选择 Setup 或 Update')

    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在加载 Codex 的 Setup 计划')
    expect(loadPlan).toHaveBeenCalledWith('codex', 'setup')

    resolvePlan?.(setupPlan)
    const preview = await screen.findByTestId('host-plan-preview')
    expect(preview).toHaveTextContent('tenon setup --codex')
    expect(screen.getByTestId('host-plan-ready-announcement')).toHaveTextContent(
      'Codex 的 Setup 计划已就绪',
    )
    expect(preview).toHaveTextContent('登记宿主 marketplace')
    expect(preview).toHaveTextContent('安装 Tenon 插件')
    expect(preview).toHaveTextContent('检查 Codex 登录状态')
    expect(preview).toHaveTextContent('codex login status')
    expect(preview).toHaveTextContent('认证引导')
    expect(preview).toHaveTextContent('生成计划是只读操作')
    expect(screen.queryByRole('button', { name: /执行|Run command/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '选择 Cursor' }))
    expect(screen.queryByText('tenon setup --codex')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('选择 Setup 或 Update')
  })

  it('shows a plan error and retries the exact selected operation', async () => {
    const loadPlan = vi.fn()
      .mockRejectedValueOnce(
        new HostTargetPlanClientError('http', 'HOST_TARGET_PLAN_UNAVAILABLE', 503),
      )
      .mockResolvedValueOnce(setupPlan)
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan,
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('宿主计划服务暂时不可用')

    fireEvent.click(screen.getByRole('button', { name: '重试 Setup 计划' }))
    expect(await screen.findByTestId('host-plan-preview')).toHaveTextContent('tenon setup --codex')
    expect(loadPlan).toHaveBeenNthCalledWith(2, 'codex', 'setup')
  })

  it('copies only the previewed command and announces success', async () => {
    const copyText = vi.fn().mockResolvedValue(undefined)
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockResolvedValue(setupPlan),
      copyText,
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    fireEvent.click(await screen.findByRole('button', { name: '复制命令' }))

    expect(await screen.findByText('命令已复制。')).toHaveAttribute('role', 'status')
    expect(copyText).toHaveBeenCalledWith('tenon setup --codex')
  })

  it('keeps the command visible and announces clipboard failure', async () => {
    const copyText = vi.fn().mockRejectedValue(new Error('clipboard denied'))
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockResolvedValue(setupPlan),
      copyText,
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    fireEvent.click(await screen.findByRole('button', { name: '复制命令' }))

    expect(await screen.findByText('复制失败，请手动选择命令。')).toHaveAttribute('role', 'status')
    expect(screen.getByText('tenon setup --codex')).toBeVisible()
  })

  it('turns a synchronous clipboard exception into an announced copy error', async () => {
    const copyText = vi.fn(() => {
      throw new Error('clipboard unavailable')
    })
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockResolvedValue(setupPlan),
      copyText,
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    fireEvent.click(await screen.findByRole('button', { name: '复制命令' }))

    expect(await screen.findByText('复制失败，请手动选择命令。')).toHaveAttribute('role', 'status')
  })

  it('ignores a late plan response after the user switches targets', async () => {
    let resolvePlan: ((value: HostTargetPlan) => void) | undefined
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn(() => new Promise<HostTargetPlan>((resolve) => {
        resolvePlan = resolve
      })),
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    fireEvent.click(screen.getByRole('button', { name: '选择 Cursor' }))
    resolvePlan?.(setupPlan)

    await waitFor(() => {
      expect(screen.queryByTestId('host-plan-preview')).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent('选择 Setup 或 Update')
    })
  })

  it('renders the complete fixed UI in English without leaking Chinese copy', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockResolvedValue(setupPlan),
    })

    expect(await screen.findByRole('heading', { name: 'Host target plans' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select Codex' }))
    expect(screen.getByText('User scope')).toBeInTheDocument()
    expect(screen.getByText('Native marketplace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))

    const view = await screen.findByTestId('host-plan-view')
    expect(view).toHaveTextContent('Register the host marketplace')
    expect(view).toHaveTextContent('Generating this plan is read-only')
    expect(view.textContent).not.toMatch(/[宿主选择计划步骤复制安装更新]/)
  })

  it.each([
    [
      'network',
      new HostTargetPlanClientError('network', 'HOST_TARGET_NETWORK_ERROR'),
      'Could not reach the local Tenon service. Check the connection and retry.',
    ],
    [
      'HTTP',
      new HostTargetPlanClientError('http', 'HOST_TARGET_PLAN_UNAVAILABLE', 503),
      'Host plan service is temporarily unavailable. Retry in a moment.',
    ],
    [
      'decoder',
      new HostTargetPlanClientError('decoder', 'HOST_TARGET_CATALOG_RESPONSE_INVALID', 200),
      'The host target catalog response was invalid. Retry after updating Tenon.',
    ],
  ])('maps a stable %s catalog error to English UI copy', async (_kind, error, expected) => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderView({ loadTargets: vi.fn().mockRejectedValue(error) })

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(screen.queryByText(error.code)).toBeNull()
  })

  it('maps a stable plan mismatch to English UI copy', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockRejectedValue(
        new HostTargetPlanClientError('mismatch', 'HOST_TARGET_PLAN_REQUEST_MISMATCH', 200),
      ),
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Select Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The returned plan did not match the selected host and operation. Retry the request.',
    )
  })

  it('falls back to unknown stable step and notice tokens without hiding the plan', async () => {
    const planWithFutureTokens: HostTargetPlan = {
      ...setupPlan,
      steps: [{ id: 'future-step', label: 'host-plan.step.future-step', command: null }],
      notices: ['host-plan.notice.future-notice'],
    }
    renderView({
      loadTargets: vi.fn().mockResolvedValue(catalog),
      loadPlan: vi.fn().mockResolvedValue(planWithFutureTokens),
    })

    fireEvent.click(await screen.findByRole('button', { name: '选择 Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))

    expect(await screen.findByText('host-plan.step.future-step')).toBeInTheDocument()
    expect(screen.getByText('host-plan.notice.future-notice')).toBeInTheDocument()
  })
})
