import { useState, type FormEvent } from 'react'
import { ApiError, registerProject } from '../api/client'
import { useT } from '../i18n'

interface ProjectRegistrationFormProps {
  onRegistered?: (root: string) => void | Promise<void>
  compact?: boolean
}

/** 机器级项目注册的真实产品入口。这里只收路径并调用 server；目录存在性、realpath、重复注册和
 * inode 信任锚都由 `/api/projects` 统一判定，前端不模拟文件系统。 */
export function ProjectRegistrationForm({ onRegistered, compact = false }: ProjectRegistrationFormProps): JSX.Element {
  const { t } = useT()
  const [root, setRoot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const requested = root.trim()
    if (requested === '') return
    setBusy(true)
    setError('')
    try {
      const registered = await registerProject(requested)
      await onRegistered?.(registered.root)
      setRoot('')
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={compact ? 'flex min-w-[320px] flex-wrap items-start gap-2' : 'mb-5 rounded-lg border border-border bg-fill p-3 text-left'}
      data-testid="project-register-form"
      onSubmit={(event) => void submit(event)}
    >
      {!compact && (
        <div className="mb-2">
          <h3 className="text-[13px] font-semibold text-text">{t('onboard.register_title')}</h3>
          <p className="mt-0.5 text-xs text-text-3">{t('onboard.register_note')}</p>
        </div>
      )}
      <div className={compact ? 'min-w-[220px] flex-1' : 'flex gap-2'}>
        <label className="sr-only" htmlFor="project-register-path">{t('onboard.register_path')}</label>
        <input
          id="project-register-path"
          data-testid="project-register-path"
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-text outline-none focus:border-(--accent)"
          value={root}
          placeholder={t('onboard.register_placeholder')}
          autoComplete="off"
          onChange={(event) => setRoot(event.target.value)}
        />
        {!compact && (
          <button
            type="submit"
            data-testid="project-register-submit"
            disabled={busy || root.trim() === ''}
            className="flex-none rounded-md bg-btn-bg px-3 py-2 text-xs font-bold text-btn-fg hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('onboard.registering') : t('onboard.register')}
          </button>
        )}
      </div>
      {compact && (
        <button
          type="submit"
          data-testid="project-register-submit"
          disabled={busy || root.trim() === ''}
          className="flex-none rounded-md bg-btn-bg px-3 py-2 text-xs font-bold text-btn-fg hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('onboard.registering') : t('onboard.register')}
        </button>
      )}
      {error !== '' && <p className="mt-2 w-full text-xs text-red" role="alert">{error}</p>}
    </form>
  )
}
