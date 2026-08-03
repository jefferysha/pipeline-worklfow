import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { stateStorageSourcePathSync, TERMINAL_ACTIVITY_FILE } from '@tenon/kernel'
import { dedupeRoots } from './projectRoots.js'
import { repositoryTopologyFingerprint } from './repositoryFingerprint.js'
import {
  assertWorkflowRootAnchor,
  captureWorkflowRootAnchor,
  closeWorkflowRootAnchor,
  type WorkflowRootAnchor,
} from './workflowRootAnchor.js'

type ActivityReader = (
  changeDir: string,
  changeName: string,
  nowMs: number,
) => Promise<unknown | undefined>

/** Build the SSE input fingerprint while retaining the same registered-root anchor as snapshots. */
export async function computeSnapshotFingerprint(
  roots: string[],
  nowMs: number,
  rootAnchor: ((root: string) => WorkflowRootAnchor | undefined) | undefined,
  readTerminalActivity: ActivityReader,
): Promise<string> {
  const parts: string[] = []
  for (const root of dedupeRoots(roots)) {
    parts.push(`registry:${root}`)
    let anchor: WorkflowRootAnchor | undefined
    let ownsAnchor = false
    try {
      if (rootAnchor !== undefined) {
        anchor = rootAnchor(root)
        if (anchor === undefined) throw new Error('registered root 没有可信目录锚')
      } else {
        anchor = captureWorkflowRootAnchor(root)
        ownsAnchor = true
      }
      assertWorkflowRootAnchor(anchor)
      const readRoot = anchor.fdPath ?? anchor.realPath
      parts.push(`root:${root}:${anchor.dev}:${anchor.ino}`)
      parts.push(...await repositoryTopologyFingerprint(readRoot))
      const changesRoot = join(readRoot, 'openspec', 'changes')
      const entries = await readdir(changesRoot, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive') continue
        const changeDir = join(changesRoot, entry.name)
        const source = stateStorageSourcePathSync(changeDir)
        if (source === undefined) continue
        try {
          const stat = await lstat(source, { bigint: true })
          parts.push(`${source}:${stat.size}:${stat.mtimeNs}`)
        } catch {
          // A selected source can disappear between selection and lstat; the next poll recalculates.
        }
        for (const name of ['tasks.md', '.pipeline-documents.json'] as const) {
          const target = join(changeDir, name)
          try {
            const stat = await lstat(target, { bigint: true })
            parts.push(`${target}:${stat.size}:${stat.mtimeNs}`)
          } catch {
            // Missing optional snapshot input is represented by its absence from the fingerprint.
          }
        }
        const activity = join(changeDir, TERMINAL_ACTIVITY_FILE)
        try {
          const stat = await lstat(activity, { bigint: true })
          const live = await readTerminalActivity(changeDir, entry.name, nowMs)
          parts.push(`${activity}:${stat.size}:${stat.mtimeNs}:${live === undefined ? 'stale' : 'live'}`)
        } catch {
          // No sidecar is the normal idle state.
        }
      }
      assertWorkflowRootAnchor(anchor)
    } catch {
      parts.push(`unreadable:${root}`)
    } finally {
      if (ownsAnchor && anchor !== undefined) closeWorkflowRootAnchor(anchor)
    }
  }
  parts.sort()
  return parts.join('|')
}
