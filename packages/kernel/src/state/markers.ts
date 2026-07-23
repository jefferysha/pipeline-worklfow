/**
 * default workflow 收尾侧写：<changeDir>/.breadcrumb（hook 热路径读的当前相位缓存）与
 * <root>/.pipeline-pending-review（复核硬闸 marker）。两者原先只在
 * cli/commands/transition.ts 一份实现，server/transition.ts 完全没有——dashboard 放行推进到
 * review 相位时复核门直接失效（G1 已核实的 P1 bug）。G1 REFACTOR 后 CLI 与 server 都改经
 * applyBreadcrumbTail/applyReviewMarkerTail（transitionTail.ts）消费这里的 writer +
 * reviewHint，「何时写」的决策逻辑不再各自维护一份。writer 本身 fail-loud；best-effort
 * （失败仅 WARN）语义由调用方兜，同 history writer 的分工。
 *
 * REVIEW_MARKER_FILE 的字面量与 types.ts::GATE_MARKERS[1] 相同但并非派生自它——GATE_MARKERS
 * 目前在 TS 代码里没有消费方（marker 拦截的运行时真相源是 hooks/gate.sh 动态拼接
 * `.pipeline-pending-$kind`），两处独立持有同一个稳定协议文件名，不是「决策逻辑」重复。
 *
 * review marker 的路径以 `root` 参数化而非闭包 cwd：CLI 单进程对应单项目，可以用
 * process.cwd() 闭包；server 是长驻多项目守护进程，没有单一"当前项目"概念，必须显式传入
 * 该 change 所属 project 的 root。
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Phase } from '../types.js'

export const BREADCRUMB_FILE = '.breadcrumb'
export const REVIEW_MARKER_FILE = '.pipeline-pending-review'

export interface BreadcrumbWriter {
  write(changeDir: string, content: string): Promise<void>
}

export function createBreadcrumbWriter(): BreadcrumbWriter {
  return {
    async write(changeDir: string, content: string): Promise<void> {
      await writeFile(join(changeDir, BREADCRUMB_FILE), content, 'utf8')
    },
  }
}

export interface ReviewMarkerWriter {
  write(root: string, content: string): Promise<void>
}

export function createReviewMarkerWriter(): ReviewMarkerWriter {
  return {
    async write(root: string, content: string): Promise<void> {
      await writeFile(join(root, REVIEW_MARKER_FILE), content, 'utf8')
    },
  }
}

/** review 相位的 marker 指引文案（老内核 state-transition.sh 同款三行格式的第二行）。 */
export function reviewHint(phase: Phase): string {
  switch (phase) {
    case 'explore': return 'design_doc（深度设计 / 调研 + 关键决策）'
    case 'spec': return 'plan / 用户旅程 / delta spec（实施计划）'
    case 'verify': return 'verification_report（验证结论）'
    default: return '（待复核）'
  }
}
