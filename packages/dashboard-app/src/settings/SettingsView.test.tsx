import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { SettingsView } from './SettingsView'

beforeEach(() => {
  localStorage.clear()
})

function renderSettings() {
  render(
    <I18nProvider>
      <SettingsView />
    </I18nProvider>,
  )
}

describe('SettingsView 相位轴（病灶①：配置从看板搬进设置）', () => {
  it('相位轴列出全部 7 相位', () => {
    renderSettings()
    for (const phase of ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']) {
      expect(screen.getByTestId(`axis-${phase}`)).toBeInTheDocument()
    }
  })

  it('复核门相位（explore/spec/verify）标复核门徽标，build 不标', () => {
    renderSettings()
    expect(screen.getByTestId('axis-gate-explore')).toBeInTheDocument()
    expect(screen.getByTestId('axis-gate-spec')).toBeInTheDocument()
    expect(screen.getByTestId('axis-gate-verify')).toBeInTheDocument()
    expect(screen.queryByTestId('axis-gate-build')).toBeNull()
    expect(screen.queryByTestId('axis-gate-open')).toBeNull()
  })

  it('verify 行显示双出口目标（交付 / 实现）', () => {
    renderSettings()
    const row = screen.getByTestId('axis-verify')
    expect(row.textContent).toContain('交付')
    expect(row.textContent).toContain('实现')
  })
})

describe('SettingsView 技能矩阵', () => {
  it('切到矩阵 tab 渲染 phase×track 表 + 只读提示', () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    expect(screen.getByTestId('matrix-table')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-readonly-note')).toBeInTheDocument()
  })

  it('矩阵单元含 manifest 镜像的强制 skill（build.backend → TDD）', () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    const cell = screen.getByTestId('matrix-cell-build-backend')
    expect(cell.textContent).toContain('superpowers:test-driven-development')
  })

  it('open 行经 _all 兜底显示 propose skill', () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    expect(screen.getByTestId('matrix-cell-open-backend').textContent).toContain('propose')
  })
})
