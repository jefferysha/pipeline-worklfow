import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

/**
 * WorkflowEditorView（GOAL E8 workflow 编辑器画布 Task 5）—— 自定义 workflow 列表页：
 * 拉取 / 新建（空 steps 骨架）/ 删除。消费 Task 2/3 的
 * GET /api/workflows、POST /api/workflows/:name、DELETE /api/workflows/:name。
 *
 * `default` workflow 不可经本编辑器创建/编辑/删除（runtime 不读该文件）——新建名字校验
 * 显式拒绝字面量 "default"，与既有 AfkWorkbench.tsx / LoopsPanel.tsx 一致的
 * readErrorDetail + useCallback load + 行内错误文案模式（不静默失败、不引入 toast 库）。
 *
 * 画布本身（onOpen 之后打开哪个 workflow）留给 Task 6 建；父级接线（导航 + onOpen 回调）
 * 留给 Task 9——本组件只保证 onOpen(name) 在正确时机被正确调用。
 */
export interface WorkflowEditorViewProps {
  root: string
  onOpen: (name: string) => void
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/

interface ErrorBody { error?: string }

/** 非 2xx 响应尽量读出 server 的 { error } 文案；没有 JSON 体就吞掉，回落调用方的通用文案。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

export function WorkflowEditorView({ root, onOpen }: WorkflowEditorViewProps): JSX.Element {
  const { t } = useT()
  const [names, setNames] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/workflows?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<{ names: string[] }>
      })
      .then((body) => {
        setNames(body.names)
        setError(null)
      })
      .catch((err: unknown) => setError(t('workflow_editor.load_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })))
  }, [root, t])

  useEffect(() => load(), [load])

  async function createWorkflow(): Promise<void> {
    setFormError(null)
    if (!NAME_RE.test(newName) || newName === 'default') {
      setFormError(t('workflow_editor.invalid_name'))
      return
    }
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(newName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: newName, steps: [], root }),
      })
      if (!res.ok) {
        setFormError(t('workflow_editor.create_error', { msg: (await readErrorDetail(res)) || `(${res.status})` }))
        return
      }
      onOpen(newName)
    } catch (err) {
      setFormError(t('workflow_editor.create_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') }))
    }
  }

  async function confirmDelete(name: string): Promise<void> {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        setError(t('workflow_editor.delete_error', { msg: (await readErrorDetail(res)) || `(${res.status})` }))
        setPendingDelete(null)
        return
      }
      setPendingDelete(null)
      // 乐观本地移除而非 load() 重拉：真实 server 场景下重拉也没问题，但避免额外一次网络
      // 往返，且不依赖“重拉一定能反映刚才的写入”这一时序假设。
      setNames((prev) => (prev ?? []).filter((n) => n !== name))
    } catch (err) {
      setError(t('workflow_editor.delete_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') }))
      setPendingDelete(null)
    }
  }

  if (error) return <p className="subtitle">{error}</p>
  if (!names) return <p className="subtitle">{t('common.loading')}</p>

  return (
    <div className="workflow-editor-list">
      <h2>{t('workflow_editor.title')}</h2>
      {names.length === 0 && <p className="subtitle">{t('workflow_editor.empty')}</p>}
      <ul>
        {names.map((name) => (
          <li key={name}>
            <button onClick={() => onOpen(name)}>{name}</button>
            <button onClick={() => setPendingDelete(name)}>{t('workflow_editor.delete')}</button>
          </li>
        ))}
      </ul>
      {pendingDelete && (
        <div role="dialog" className="workflow-delete-confirm">
          <p>{t('workflow_editor.delete_confirm', { name: pendingDelete })}</p>
          <button onClick={() => confirmDelete(pendingDelete)}>{t('workflow_editor.confirm_delete')}</button>
          <button onClick={() => setPendingDelete(null)}>{t('workflow_editor.cancel')}</button>
        </div>
      )}
      <div className="workflow-editor-new">
        <input
          placeholder={t('workflow_editor.new_placeholder')}
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setFormError(null) }}
        />
        <button onClick={createWorkflow}>{t('workflow_editor.create')}</button>
        {formError && <p className="subtitle">{formError}</p>}
      </div>
    </div>
  )
}
