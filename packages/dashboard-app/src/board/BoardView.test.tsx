import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { BoardView } from './BoardView'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => {
      store[k] = v
    },
    getData: (k: string) => store[k] ?? '',
    dropEffect: '',
    effectAllowed: '',
  }
}

function renderBoard(over: Partial<Parameters<typeof BoardView>[0]> = {}) {
  const props = {
    snapshot: makeSnapshot([makeProject('/repo', [makeChange('c1', 'build')])]),
    loading: false,
    error: null,
    onTransition: vi.fn().mockResolvedValue(undefined),
    onToast: vi.fn(),
    onError: vi.fn(),
    ...over,
  }
  render(
    <I18nProvider>
      <BoardView {...props} />
    </I18nProvider>,
  )
  return props
}

describe('BoardView 7 相位列渲染（病灶①：看板只做操作）', () => {
  it('渲染全部 7 个相位列', () => {
    renderBoard()
    for (const phase of ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']) {
      expect(screen.getByTestId(`board-col-${phase}`)).toBeInTheDocument()
    }
  })

  it('卡片落在其相位列（build 卡在 build 列，不在 verify 列）', () => {
    renderBoard()
    expect(screen.getByTestId('board-col-build').textContent).toContain('c1')
    expect(screen.getByTestId('board-col-verify').textContent).not.toContain('c1')
  })

  it('看板上不再出现配置矩阵（Settings 才有）', () => {
    renderBoard()
    expect(screen.queryByTestId('matrix-table')).toBeNull()
    expect(screen.queryByTestId('settings-axis')).toBeNull()
  })

  it('空看板显示提示', () => {
    renderBoard({ snapshot: makeSnapshot([]) })
    expect(screen.getByTestId('board-empty')).toBeInTheDocument()
  })
})

describe('BoardView 拖拽换列 → 转换（真触发 onTransition）', () => {
  it('build 卡拖到 verify 列 → onTransition(name, root, build-complete)', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo-a', [makeChange('c1', 'build')])]),
    })
    const card = screen.getByTestId('board-card-c1')
    const target = screen.getByTestId('board-col-verify')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.dragOver(target, { dataTransfer: dt })
    fireEvent.drop(target, { dataTransfer: dt })
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo-a', 'build-complete'))
    await waitFor(() => expect(props.onToast).toHaveBeenCalled())
  })

  it('重名跨项目：拖动的卡携带自己的 root', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo-a', [makeChange('dup', 'build')]),
        makeProject('/repo-b', [makeChange('dup', 'build')]),
      ]),
    })
    const cards = screen.getAllByTestId('board-card-dup')
    expect(cards).toHaveLength(2)
    const dt = makeDataTransfer()
    fireEvent.dragStart(cards[1]!, { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-verify'), { dataTransfer: dt })
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('dup', '/repo-b', 'build-complete'))
  })

  it('回退边（verify→build）弹二次确认，不立即转换；确认后触发 verify-fail', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c2'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-build'), { dataTransfer: dt })
    // 弹确认框、未立即转换
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(props.onTransition).not.toHaveBeenCalled()
    // 确认
    fireEvent.click(screen.getByTestId('board-confirm-yes'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c2', '/repo', 'verify-fail'))
  })

  it('非法落点（open→verify 跳跃）no-op', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c3', 'open')])]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c3'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-verify'), { dataTransfer: dt })
    await new Promise((r) => setTimeout(r, 0))
    expect(props.onTransition).not.toHaveBeenCalled()
  })

  it('转换失败 → onError 呈现 server 文案', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c1', 'build')])]),
      onTransition: vi.fn().mockRejectedValue(new Error('前置校验不满足')),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c1'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-verify'), { dataTransfer: dt })
    await waitFor(() => expect(props.onError).toHaveBeenCalled())
    expect((props.onError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('前置校验不满足')
  })
})
