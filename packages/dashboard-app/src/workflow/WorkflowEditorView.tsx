import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { changeWorkflow } from '../inbox/inbox'
import { rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { Dialog } from '../shell/Dialog'
import type { Snapshot } from '../types'
import { revealDialog, revealList } from './motion'

gsap.registerPlugin(useGSAP)

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
  /**
   * 主 snapshot（App 的 useSnapshot() 产出，与 AfkWorkbench.tsx 的同名 prop 是同一份数据源）：
   * 引用计数（评审 P2-14 前半，Task 14）——行 meta「N 相位 · M 门 · K 张引用」与删除确认弹窗的
   * 引用数红字警示，K 值纯前端算，不新增任何网络请求。root 语境同 AfkWorkbench.tsx
   * contextChanges() 一致的既有约定（''=聚合全部 ok 项目，非空=只看该项目），不重新发明。
   * 缺省/null → 引用数一律按 0 计（不阻塞列表本身渲染，只是引用数信息暂缺）。
   */
  snapshot?: Snapshot | null
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

export function WorkflowEditorView({ root, onOpen, snapshot = null }: WorkflowEditorViewProps): JSX.Element {
  const { t } = useT()
  const [names, setNames] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  // whole-feature review Finding 2：DELETE 失败此前复用了"加载失败"专用的致命 `error`
  // state——下面的顶层 `if (error) return <p>...</p>` 会把整个列表 + 新建表单替换成一行错误
  // 文案，用户没有任何办法恢复（不能重试删除、不能新建、不能打开其它 workflow），除非刷新
  // 整个页面。用独立、非致命的 deleteError，就近渲染在列表旁边（同 formError 之于新建表单
  // 的既有模式一致），不吞掉其余 UI。
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const rootRef = useRef<HTMLElement>(null)

  // 引用计数（评审 P2-14 前半，Task 14）：root 语境同 AfkWorkbench.tsx 的 contextChanges()
  // 一致的既有约定（''=聚合全部 ok 项目，非空=只看该项目），不重新发明 root 过滤语义。
  // changeWorkflow() 处理 change 未设 workflow 字段时回落到 'default' 的既有规则，逐字复用。
  const refCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!snapshot) return counts
    for (const p of snapshot.projects) {
      if (!p.ok) continue
      if (root !== '' && p.root !== root) continue
      for (const c of p.changes) {
        const wf = changeWorkflow(c)
        counts.set(wf, (counts.get(wf) ?? 0) + 1)
      }
    }
    return counts
  }, [snapshot, root])
  const pendingDeleteRefs = pendingDelete ? refCounts.get(pendingDelete) ?? 0 : 0

  // 行 meta 的 steps/gate 数据源：按 rulesKey(root,name) 批量拉（复用 model/workflowModel.ts
  // 的模块级缓存 + in-flight 去重，不重新实现拉取逻辑）。names 为 null（首次加载中）时传空
  // 数组——hooks 顺序不受影响（本 hook 每次 render 都无条件调用），只是暂无待拉名字。
  const { rules: rulesByKey } = useWorkflowRulesMulti(names ? [{ root, names }] : [])

  // 列表入场：只在"从加载态首次拿到数据"这一刻触发一次（依赖 Boolean(names)，不是 names
  // 本身）——如果依赖整个 names 数组，之后每次新建/删除导致的数组引用变化都会让已经在屏幕上
  // 的其余行重新播放一遍入场动效，观感是"随便动一下列表其它行就跟着抖一下"的装饰性噪音，
  // 而不是"这是一次真实的状态变化"（product register：motion conveys state, not decoration）。
  useGSAP(() => {
    if (names && names.length > 0) revealList('.workflow-editor__item')
  }, { scope: rootRef, dependencies: [Boolean(names && names.length > 0)] })

  // 迁移到共享 <Dialog>（Task 4，评审 P0-5）后不再有 backdrop 的 ref 可拿——Dialog 组件不对外
  // 暴露内部 DOM 节点。改用 useGSAP 的 scope 选择器文本寻址（同本文件上面 revealList 已有的
  // '.workflow-editor__item' 字符串选择器一致的既有写法，非本次新发明）：useGSAP 内部用
  // gsap.context(fn, scope) 包裹回调，回调体内的选择器文本会自动限定在 rootRef 子树内查找，
  // 不需要真实 DOM ref。用 data-testid 属性选择器而非裸 `.dialog__backdrop` 类名，是为了不与
  // 同一文件里可能共存的其它未迁移 dialog__backdrop 元素混选（本文件当前只有这一处，属防御性
  // 写法）。
  useGSAP(() => {
    if (pendingDelete) {
      revealDialog(
        '[data-testid="workflow-delete-confirm"]',
        '[data-testid="workflow-delete-confirm"] .dialog',
      )
    }
  }, { scope: rootRef, dependencies: [pendingDelete] })

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
    setDeleteError(null)
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        setDeleteError(t('workflow_editor.delete_error', { msg: (await readErrorDetail(res)) || `(${res.status})` }))
        setPendingDelete(null)
        return
      }
      setPendingDelete(null)
      // 乐观本地移除而非 load() 重拉：真实 server 场景下重拉也没问题，但避免额外一次网络
      // 往返，且不依赖“重拉一定能反映刚才的写入”这一时序假设。
      setNames((prev) => (prev ?? []).filter((n) => n !== name))
    } catch (err) {
      setDeleteError(t('workflow_editor.delete_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') }))
      setPendingDelete(null)
    }
  }

  if (error) return <p className="view__note view__note--error">{error}</p>
  if (!names) return <p className="view__note">{t('common.loading')}</p>

  return (
    <section className="view workflow-editor" data-testid="workflow-editor-view" ref={rootRef}>
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('workflow_editor.title')}</h1>
          <p className="view__subtitle">{t('workflow_editor.subtitle')}</p>
        </div>
        {names.length > 0 && <span className="view__count">{names.length}</span>}
      </header>

      {names.length === 0 ? (
        <div className="empty">
          <div className="empty__mark" aria-hidden="true">⎔</div>
          <h2 className="empty__title">{t('workflow_editor.empty')}</h2>
          <p className="empty__desc">{t('workflow_editor.empty_desc')}</p>
        </div>
      ) : (
        <ul className="workflow-editor__list">
          {names.map((name) => {
            // 评审 P2-14 前半（Task 14）：行 meta 只在 rules 已就绪时渲染——拉取失败/仍在途的
            // 名字不在 rulesByKey 里，那一行就不出 meta（G17"卡不消失"纪律同源：宁可信息
            // 不全，也不能让整行消失或显示错误数字）。引用数（refs）与 rules 就绪与否无关，
            // 但一并归在同一条 meta 里——单独露出"K 张引用"而 steps/gate 数缺失意义不大。
            const rowRules = rulesByKey.get(rulesKey(root, name))
            const refs = refCounts.get(name) ?? 0
            return (
              <li key={name} className="card workflow-editor__item">
                <div className="workflow-editor__item-main">
                  <button className="workflow-editor__open" onClick={() => onOpen(name)}>
                    <span className="workflow-editor__open-mark" aria-hidden="true">⎔</span>
                    {name}
                  </button>
                  {rowRules && (
                    <span className="workflow-editor__meta" data-testid={`wf-meta-${name}`}>
                      {t('workflow_editor.meta', {
                        steps: rowRules.steps.length,
                        gates: Object.values(rowRules.gateByStep).filter(Boolean).length,
                        refs,
                      })}
                    </span>
                  )}
                </div>
                <button className="btn--icon" onClick={() => setPendingDelete(name)}>{t('workflow_editor.delete')}</button>
              </li>
            )
          })}
        </ul>
      )}

      {deleteError && <p className="view__note view__note--error">{deleteError}</p>}

      {pendingDelete && (
        <Dialog
          title={`${t('workflow_editor.delete')} "${pendingDelete}"`}
          onClose={() => setPendingDelete(null)}
          testid="workflow-delete-confirm"
          actions={
            <>
              <button className="btn btn--ghost" onClick={() => setPendingDelete(null)}>{t('workflow_editor.cancel')}</button>
              <button className="btn btn--danger" onClick={() => confirmDelete(pendingDelete)}>{t('workflow_editor.confirm_delete')}</button>
            </>
          }
        >
          <p className="dialog__desc">{t('workflow_editor.delete_confirm', { name: pendingDelete })}</p>
          {pendingDeleteRefs > 0 && (
            <p className="dialog__desc dialog__desc--danger" data-testid="workflow-delete-refs-warning">
              {t('workflow_editor.delete_refs_warning', { n: pendingDeleteRefs })}
            </p>
          )}
        </Dialog>
      )}

      <div className="workflow-editor__new">
        <input
          className="input"
          placeholder={t('workflow_editor.new_placeholder')}
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setFormError(null) }}
        />
        <button className="btn" onClick={createWorkflow}>{t('workflow_editor.create')}</button>
      </div>
      {formError && <p className="view__note view__note--error">{formError}</p>}
    </section>
  )
}
