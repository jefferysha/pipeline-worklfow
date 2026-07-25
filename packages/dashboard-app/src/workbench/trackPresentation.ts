import type { WbTrackDefinition } from '../api/client'

export function trackDisplayName(track: WbTrackDefinition): string {
  const builtin: Record<string, string> = {
    chat: '对话',
    simple: '简单任务',
    pm: '产品',
    frontend: '前端',
    backend: '后端',
    free: '自由模式',
  }
  return builtin[track.id] ?? track.label
}
