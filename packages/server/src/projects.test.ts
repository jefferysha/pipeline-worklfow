import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { readProjectRegistry, registerProjectRoot, writeProjectRegistry } from '@tenon/kernel'
import { addProjectToRegistry, removeProjectFromRegistry } from './projects.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function projectRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

describe('Dashboard project registry writers', () => {
  test('Dashboard add and CLI registration share one serialized registry transaction', async () => {
    const configRoot = await projectRoot('tenon-project-registry-config-')
    const registryPath = join(configRoot, 'projects.json')
    const dashboardRoots = await Promise.all(
      Array.from({ length: 20 }, (_, index) => projectRoot(`tenon-dashboard-${index}-`)),
    )
    const cliRoots = await Promise.all(
      Array.from({ length: 20 }, (_, index) => projectRoot(`tenon-cli-${index}-`)),
    )

    const results = await Promise.all([
      ...dashboardRoots.map((root) => addProjectToRegistry(registryPath, root)),
      ...cliRoots.map((root) => registerProjectRoot(registryPath, root)),
    ])

    expect(results.every((result) => typeof result === 'boolean' ? result : result.ok)).toBe(true)
    expect(new Set(readProjectRegistry(registryPath))).toEqual(
      new Set([...dashboardRoots, ...cliRoots].map((root) => resolvePath(root))),
    )
  })

  test('Dashboard remove cannot overwrite concurrent registrations', async () => {
    const configRoot = await projectRoot('tenon-project-registry-remove-config-')
    const registryPath = join(configRoot, 'projects.json')
    const oldRoots = await Promise.all(
      Array.from({ length: 20 }, (_, index) => projectRoot(`tenon-old-${index}-`)),
    )
    const newRoots = await Promise.all(
      Array.from({ length: 20 }, (_, index) => projectRoot(`tenon-new-${index}-`)),
    )
    await writeProjectRegistry(registryPath, oldRoots)

    const results = await Promise.all([
      ...oldRoots.map((root) => removeProjectFromRegistry(registryPath, root)),
      ...newRoots.map((root) => registerProjectRoot(registryPath, root)),
    ])

    expect(results.every((result) => typeof result === 'boolean' ? result : result.ok)).toBe(true)
    expect(new Set(readProjectRegistry(registryPath))).toEqual(
      new Set(newRoots.map((root) => resolvePath(root))),
    )
  })
})
