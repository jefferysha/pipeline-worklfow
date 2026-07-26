import { homedir } from 'node:os'
import {
  enforceActiveLoopExecutionWiring,
  type LoopExecutionGuardResult,
} from '@tenon/automation'
import { readRegistrySnapshot } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { createProductionSkillContentLocator } from '../skillBundleAssembly.js'

export async function enforceProductionLoopWiring(
  deps: CliDeps,
  loopIds: readonly string[] | undefined,
  home = homedir(),
): Promise<LoopExecutionGuardResult> {
  let selected = loopIds
  if (selected === undefined) {
    const snapshot = await readRegistrySnapshot(deps.cwd)
    if (snapshot.registry === null) {
      if (snapshot.errors.length === 0) return { blocked: [] }
      throw new Error(`loops registry 无法校验：${snapshot.errors.join('；')}`)
    }
    selected = snapshot.registry.loops
      .filter((loop) => loop.status === 'active')
      .map((loop) => loop.id)
  }
  if (selected.length === 0) return { blocked: [] }

  const wiringForRunner = (runner: string) => ({
    resolver: deps.resolver,
    locator: createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot,
      home,
      runner,
    }),
    isSkillProfileKnown: deps.isSkillProfileKnown,
  })
  return enforceActiveLoopExecutionWiring(selected, {
    repoRoot: deps.cwd,
    wiring: {
      repoRoot: deps.cwd,
      skillBundleWiring: wiringForRunner('codex'),
      skillBundleWiringForLoop: (loop) => wiringForRunner(loop.runner),
    },
  })
}
