/**
 * 共享 SVG 图标 sprite（OpenAI 配色 × Trellis 重塑，Task 2；视觉真相源
 * `design-demos/v4-openai-trellis.html` 的 `<symbol id="i-*">` 集，造型借用后重绘到
 * 16 网格）。单文件 path 表，零外部资源、零 emoji；全 dashboard 后续任务统一消费。
 *
 * 尺寸纪律：viewBox 固定 0 0 16 16，`size` 只改 width/height，形状本身不跟着重排——
 * 保证同一 name 在不同调用点缩放一致。颜色恒为 currentColor，由调用方外层元素的
 * `color` 决定（不提供 color/className prop，避免和 token 系统产生第二套着色入口）。
 */
export type IconName =
  | 'check'
  | 'copy'
  | 'doc'
  | 'link'
  | 'x'
  | 'chevron'
  | 'inbox'
  | 'board'
  | 'flow'
  | 'gauge'
  | 'gate'
  | 'clock'
  | 'folder'
  | 'layers'

/** Record<IconName, ...> 逼迫 TS 在编译期核对 14 个 name 全部有形状，漏项直接类型报错。 */
const PATHS: Record<IconName, JSX.Element> = {
  check: <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />,
  x: <path d="M4 4L12 12M12 4L4 12" />,
  chevron: <path d="M4 6L8 10L12 6" />,
  copy: (
    <>
      <rect x="6" y="6" width="7" height="7" rx="1" />
      <path d="M4 10H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" />
    </>
  ),
  doc: (
    <>
      <path d="M9 2H4v12h8V5z" />
      <path d="M9 2v3h3" />
    </>
  ),
  link: (
    <>
      <rect x="2.75" y="8.4" width="6.5" height="3.2" rx="1.6" transform="rotate(-45 6 10)" />
      <rect x="6.75" y="4.4" width="6.5" height="3.2" rx="1.6" transform="rotate(-45 10 6)" />
    </>
  ),
  inbox: (
    <>
      <path d="M2 8.7h3.3l1.3 2h2.7l1.3-2h3.3" />
      <path d="M3.3 2.7h9.3l1.3 6v4a.7.7 0 0 1-.7.7H2.7a.7.7 0 0 1-.7-.7v-4z" />
    </>
  ),
  board: <path d="M3 13V4M8 13V8M13 13V6" />,
  flow: (
    <>
      <circle cx="4" cy="8" r="1.4" />
      <circle cx="12" cy="4.3" r="1.4" />
      <circle cx="12" cy="11.7" r="1.4" />
      <path d="M5.3 7.3l5.3-2.4M5.3 8.7l5.3 2.4" />
    </>
  ),
  gauge: (
    <>
      <path d="M2.5 11A5.5 5.5 0 0 1 13.5 11" />
      <path d="M8 11L10.8 6.8" />
      <circle cx="8" cy="11" r="1" />
    </>
  ),
  gate: (
    <>
      <path d="M8 2l5 2v3.7c0 3-2 5.2-5 6.3-3-1.1-5-3.3-5-6.3V4z" />
      <path d="M6 7.9l1.5 1.5 2.7-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.7" />
      <path d="M8 5V8l2 1.3" />
    </>
  ),
  folder: <path d="M2 4a1 1 0 0 1 1-1H6L7.3 4.7h5.7A1 1 0 0 1 14 5.7v6A1 1 0 0 1 13 12.7H3A1 1 0 0 1 2 11.7z" />,
  layers: (
    <>
      <path d="M8 2.3L14 5.3L8 8.3L2 5.3Z" />
      <path d="M2 9.5l6 3l6-3" />
    </>
  ),
}

export function Icon({ name, size = 14 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
