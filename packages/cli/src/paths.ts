/** change 定位与名字校验（CONTRACT §3：默认在 cwd 的 openspec/changes/<name>/ 下找） */
import { join } from 'node:path'

export function changesRoot(cwd: string): string {
  return join(cwd, 'openspec', 'changes')
}

export function changeDir(cwd: string, name: string): string {
  return join(changesRoot(cwd), name)
}

/** 与老内核 validate_change_name 同口径：仅 a-z A-Z 0-9 - _（天然排除 .. / 空格 / 斜杠） */
export function isValidChangeName(name: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(name)
}
