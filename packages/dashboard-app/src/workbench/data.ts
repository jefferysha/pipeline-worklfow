/**
 * 工作台静态流程数据（T18 自 settings/ 迁入——旧设置视图退役）。
 * Track registry 与 mandatory skills 自 T-R5 起只读运行时 `/api/config` 项目快照；本文件不再
 * 维护任何轨道或技能矩阵镜像，避免自定义轨/profile 与前端手抄集合漂移。
 */
import { PHASES, REVIEW_PHASES, TRANSITIONS } from '../types'

export { PHASES, REVIEW_PHASES, TRANSITIONS }

export function isReviewGate(phase: string): boolean {
  return (REVIEW_PHASES as readonly string[]).includes(phase)
}
