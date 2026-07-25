import type { Snapshot } from '../types'

export interface WorkbenchViewProps {
  root: string
  onToggleError?: (msg: string) => void
  snapshot?: Snapshot | null
}
