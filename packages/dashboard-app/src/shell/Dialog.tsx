import { useEffect, useRef } from 'react'

/**
 * 共享 Dialog 组件（评审 P0-5/P1-9 的地基，Task 3）。
 *
 * 真机评审证实现有 7 处手写 backdrop 对话框键盘礼仪全缺：Esc 不关、焦点不进入、
 * 无困笼、卸载不归位，注册对话框更是「无路可退陷阱」。本组件收拢这四件事，
 * Task 4 起逐个迁移调用方。样式复用既有 `.dialog__backdrop/.dialog/.dialog__title/
 * .dialog__actions`（Task 1 已换新 token），不新发明样式类。
 *
 * 多层 Dialog 叠加时 Esc/Tab 的归属（brief 未覆盖，按最简正确方案登记于此）：
 * keydown 监听挂在 `document`（唯一能截获「焦点当前不在任何对话框控件上」按键的
 * 层级，也匹配测试用 `fireEvent.keyDown(document, ...)` 的写法），但处理前先查
 * `document.activeElement` 是否落在本实例容器内。由于焦点被困笼锁在最上层对话框
 * 内，背景对话框的监听器在该检查下天然是 no-op——不会出现「一次 Esc 关两层」。
 */
export interface DialogProps {
  title: string
  onClose: () => void            // Esc / backdrop / ✕ 都走它
  children: React.ReactNode
  actions?: React.ReactNode      // 底部动作条（调用方放确认/取消按钮）
  testid?: string
  /** 首个聚焦目标：缺省聚焦对话框容器内第一个可聚焦元素 */
  initialFocusRef?: React.RefObject<HTMLElement>
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function Dialog({ title, onClose, children, actions, testid, initialFocusRef }: DialogProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // 挂载：记录打开前的焦点 → 聚焦 initialFocusRef 或容器内首个可聚焦元素。
  // 卸载：焦点归位到打开前记录的元素。故意用 [] 依赖只跑一次——
  // 若跟着 initialFocusRef identity 重跑，会用「此刻已被困笼锁在对话框内」的
  // activeElement 覆盖掉 previousFocusRef，卸载归位就指哪儿也回不到打开前了。
  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = containerRef.current
    const target = initialFocusRef?.current ?? (container ? getFocusableElements(container)[0] : undefined) ?? container
    target?.focus()
    return () => {
      previousFocusRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 蓄意 mount-once，见上注释
  }, [])

  // Esc 关闭 + Tab 困笼共用一个 document 级 keydown 监听（原因见组件头注释）。
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const container = containerRef.current
      if (!container?.contains(document.activeElement)) return

      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const focusable = getFocusableElements(container)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="dialog__backdrop"
      data-testid={testid}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={containerRef} tabIndex={-1}>
        <h2 className="dialog__title">{title}</h2>
        {children}
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>
  )
}
