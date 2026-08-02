import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('keeps the workspace close control inert when close is disabled', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <Dialog
          closeDisabled
          closeLabel="Close workspace"
          onClose={onClose}
          title="Workspace"
          variant="workspace"
        >
          Content
        </Dialog>
      </I18nProvider>,
    )

    const close = screen.getByRole('button', { name: 'Close workspace' })
    expect(close).toBeDisabled()
    await user.click(close)
    expect(onClose).not.toHaveBeenCalled()
  })
})
