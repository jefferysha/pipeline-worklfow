import { createTriageCheckpointStore } from './checkpoint-store.js'

const repoRoot = process.argv[2]
const cursor = process.argv[3]
if (repoRoot === undefined || cursor === undefined) {
  throw new Error('usage: checkpoint-store.crossprocess.worker.ts <repoRoot> <cursor>')
}

const store = createTriageCheckpointStore({ repoRoot })
const ok = await store.compareAndSet(
  { sourceId: 'repo-main', actionKind: 'git-commits' },
  0,
  {
    schemaVersion: 1,
    sourceId: 'repo-main',
    actionKind: 'git-commits',
    cursor,
  },
)
process.stdout.write(JSON.stringify({ ok }))
