import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAfkLog } from '../api/client'
import { ApiError, formatApiError, isRecord, readJson, throwApiError } from '../api/transport'
import { useT } from '../i18n'

// T18 自 afk/ 迁入 progress/——旧 AFK 工作台 随 v5 三视图 IA 退役，本 hook 的唯一存活消费方
// 是 ProgressView（T11 running 行日志尾部）。下文注释里对 旧 AFK 工作台 的引用是历史语境。

/**
 * 轮询间隔（ms）——导出供测试用 `vi.advanceTimersByTimeAsync(AFK_LOG_POLL_INTERVAL_MS)` 精确
 * 对齐，不在测试里重复硬编码这个数字（一改两处同步，容易漂移）。
 */
export const AFK_LOG_POLL_INTERVAL_MS = 2500

export interface UseAfkLogResult {
  /** 随时可渲染的字符串：真实日志内容 / 空日志占位文案 / 错误文案三态合一——评审"错误全部
   *  行内可见"这条纪律依然成立，只是不再单独暴露一个 logError 字段，折进这一个字符串里
   *  （旧 AFK 工作台（T18 已退役） 里原本的 `logError ? <p className="field__error"> : <pre>` 两分支
   *  因此收敛成一个恒定渲染的 `<pre>{log}</pre>`）。 */
  log: string
  follow: boolean
  setFollow: (v: boolean) => void
  refresh: () => Promise<void>
}

/**
 * 选中 running 任务时 2.5s 轮询日志；follow=false 暂停轮询；refresh() 手动拉一次。
 *
 * 评审 P0-3「监控不成立」之一：日志此前选中拉一次即永久冻结（无轮询/无刷新钮）——运行中的
 * 任务在 AFK 面板里看起来像是卡死了，用户无从判断它是否还活着。本 hook 补上"自动轮询"与
 * "手动刷新"两条路径；`follow` 复用同一个开关同时管住"要不要继续自动轮询"与消费方
 * （旧 AFK 工作台）"要不要跟着新内容滚动到底"（跟随尾部）两件事——两者语义上本来就是同一个
 * "还在盯着这个任务的尾部实时看"意图，brief 原文措辞如此，不拆成两个开关。
 *
 * 参数签名相对 brief 字面 `(name, status)` 多出的第三个必需参数 `root`：log 端点
 * `GET /api/afk/:name/log?root=` 的 root 在 URL 层面"可省略"（server 端 `?? ''` 兜底为空串），
 * 但省略后落地 `resolvePath('')` = 进程 cwd，几乎不可能命中任何已注册项目 root，实际会 100%
 * 404（`server.ts` 的 `logMatch` 分支：`!dedupeRoots(registry()).includes(resolvePath(root))`
 * → 404 'root 未在机器级项目注册表中'；已读 server 源码核实，非猜测）。旧 AFK 工作台（T18 已退役） 迁移前
 * 的既有实现已经在带 root（`?root=${encodeURIComponent(selected.root)}`），而本任务同时把 AFK
 * 面板从"隐式单项目"改成"卡片各带 root、可跨项目混列"（P0-3 的另一半），更不能省略——两个
 * 不同项目可能有同名 change，仅凭 name 轮询会在切换选中时悄悄拉错项目的日志。
 */
export function useAfkLog(name: string | null, status: string | undefined, root: string): UseAfkLogResult {
  const { t, lang } = useT()
  const [logState, setLogState] = useState<
    { kind: 'idle' }
    | { kind: 'data'; value: string | null }
    | { kind: 'error'; cause: unknown }
  >({ kind: 'idle' })
  const [follow, setFollow] = useState(true)
  // 竞态防御：每次发起 fetchLog 时递增的请求序号（同 useSnapshot.ts 的 cancelled 标记套路是
  // 同一类"晚发出/晚落地的旧请求不该覆盖新结果"判据，这里换成序号实现）。
  //
  // 评审 Important B：此前用 `${root} ${name}` 拼出的字符串 key 只能分辨"目标是否切换"——
  // name/root 不变时（同一张卡上轮询与手动 refresh 并发）两次请求的 key 完全相同，guard 形同
  // 虚设，晚落地的旧响应会无条件覆盖新响应已经写好的结果。序号 guard 天然覆盖了字符串 key 能
  // 覆盖的一切场景（目标切换必然经由 fetchLog 的新一次调用递增序号，令旧序号作废）之外，还额外
  // 覆盖了"同目标并发"这一种旧 guard 分辨不出的乱序——因此不再需要单独维护字符串 key，只保留
  // 这一种判据。
  const seqRef = useRef(0)

  const fetchLog = useCallback(async (): Promise<void> => {
    if (!name) return
    const seq = ++seqRef.current
    try {
      const res = await fetchAfkLog(name, root)
      if (!res.ok) {
        await throwApiError(res, `AFK log ${res.status}`)
      }
      const body = await readJson(res)
      if (!isRecord(body) || (body.log !== null && typeof body.log !== 'string')) {
        throw new ApiError('', res.status)
      }
      if (seq !== seqRef.current) return // 不是最新发起的那次请求，这份结果作废
      setLogState({ kind: 'data', value: body.log })
    } catch (err) {
      if (seq !== seqRef.current) return
      setLogState({ kind: 'error', cause: err })
    }
  }, [name, root])

  // 选中目标变化（name 或 root 任一变化，含"跨项目同名"边界——fetchLog 的 identity 随两者变化，
  // 已经把 root 变化间接纳入依赖，这里不必再重复列 root）：重置为跟随态 + 立即拉第一次。
  // "选中即拉第一次"是自零样式版就有的既有行为，逐字保留（意图迁移表：断言不变，fetch 逻辑
  // 从组件内联 effect 挪进了这个 hook）。
  useEffect(() => {
    setFollow(true)
    if (!name) {
      setLogState({ kind: 'idle' })
      return
    }
    void fetchLog()
  }, [name, fetchLog])

  // 轮询：仅 status==='running' 且 follow===true 时才建立；任一条件不满足则不建立/清掉已建立的
  // （含"用户手动关掉跟随"与"任务已经跑完/暂停/失败"两种情况，是同一个判据自然覆盖）。
  useEffect(() => {
    if (!name || status !== 'running' || !follow) return
    const id = setInterval(() => {
      void fetchLog()
    }, AFK_LOG_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [name, status, follow, fetchLog])

  const refresh = useCallback(async (): Promise<void> => {
    await fetchLog()
  }, [fetchLog])

  const log = logState.kind === 'idle'
    ? ''
    : logState.kind === 'data'
      ? logState.value || t('afk.empty_log')
      : t('afk.log_error', {
          msg: formatApiError(logState.cause, t, { exposeServerDetail: lang === 'zh' }),
        })
  return { log, follow, setFollow, refresh }
}
