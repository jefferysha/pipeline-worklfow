import {
  Check,
  ChevronDown,
  Clock3,
  Columns3,
  Copy,
  FileText,
  Folder,
  Gauge,
  GitFork,
  Inbox,
  Layers3,
  Link,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react'

/**
 * 共享图标 API。调用方继续使用稳定的语义 name；形状统一由 Lucide 提供，避免 Dashboard
 * 同时维护手绘 16-grid sprite 与 24-grid 图标库。颜色继承 currentColor，装饰图标不进入
 * 无障碍树；交互名称由外层按钮或链接负责。
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

const ICONS: Record<IconName, LucideIcon> = {
  check: Check,
  copy: Copy,
  doc: FileText,
  link: Link,
  x: X,
  chevron: ChevronDown,
  inbox: Inbox,
  board: Columns3,
  flow: GitFork,
  gauge: Gauge,
  gate: ShieldCheck,
  clock: Clock3,
  folder: Folder,
  layers: Layers3,
}

export function Icon({ name, size = 14 }: { name: IconName; size?: number }): JSX.Element {
  const IconComponent = ICONS[name]
  return (
    <IconComponent
      aria-hidden={true}
      data-icon={name}
      size={size}
      strokeWidth={1.75}
    />
  )
}
