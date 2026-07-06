import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider, useT } from './index'
import { en, zh, type Dict } from './translations'

beforeEach(() => {
  localStorage.clear()
})

function keyPaths(d: Dict, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(d)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.push(path)
    else out.push(...keyPaths(v, path))
  }
  return out
}

describe('i18n completeness（zh / en 键结构逐一对齐）', () => {
  it('zh 与 en 键集合完全一致', () => {
    const zhKeys = keyPaths(zh).sort()
    const enKeys = keyPaths(en).sort()
    expect(zhKeys).toEqual(enKeys)
  })
})

function Probe(): JSX.Element {
  const { t, lang, setLang } = useT()
  return (
    <div>
      <span data-testid="txt">{t('nav.inbox')}</span>
      <span data-testid="var">{t('inbox.count', { n: 3 })}</span>
      <span data-testid="lang">{lang}</span>
      <button data-testid="to-en" onClick={() => setLang('en')}>en</button>
    </div>
  )
}

describe('useT 真 render（默认 zh、变量插值、切换 en）', () => {
  it('默认中文，插值替换 {n}', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang').textContent).toBe('zh')
    expect(screen.getByTestId('txt').textContent).toBe('收件箱')
    expect(screen.getByTestId('var').textContent).toBe('3 个在等你')
  })

  it('切到 en 后组件真更新为英文', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByTestId('to-en'))
    expect(screen.getByTestId('txt').textContent).toBe('Inbox')
    expect(screen.getByTestId('var').textContent).toBe('3 waiting on you')
  })
})
