import type { WbTrackDefinition } from '../api/client'

export function trackDisplayName(track: WbTrackDefinition, lang: 'zh' | 'en' = 'zh'): string {
  const builtinZh: Record<string, string> = {
    chat: '对话',
    simple: '简单任务',
    pm: '产品',
    frontend: '前端',
    backend: '后端',
    free: '自由模式',
  }
  const builtinEn: Record<string, string> = {
    chat: 'Chat',
    simple: 'Simple task',
    pm: 'Product',
    frontend: 'Frontend',
    backend: 'Backend',
    free: 'Free mode',
  }
  return (lang === 'en' ? builtinEn : builtinZh)[track.id] ?? track.label
}
