import type { CliDeps } from '../deps.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { SetupEnv } from './setup.js'

export async function rejectUpdate(
  deps: CliDeps,
  installer: RuntimeInstaller,
  env: SetupEnv,
  detail: string,
): Promise<number> {
  await installer.recordUpdateFailure?.({ homeDir: env.homeDir(), env: env.runtimeEnv() }, detail)
    .catch((error: unknown) => {
      deps.io.err(`WARNING: runtime update failure audit 写入失败：${error instanceof Error ? error.message : String(error)}`)
    })
  return 1
}
