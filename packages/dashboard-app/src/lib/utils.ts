import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 惯例：clsx 组合条件类名 + tailwind-merge 去冲突（后者胜）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
