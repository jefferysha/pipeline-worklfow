import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import {
  REAL_RELEASED_DASHBOARD_STARTER,
} from './released-dashboard-starter.js'
import type { ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  nativeInstallPlan,
  selectPipelineHost,
  type NativePipelineHost,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────

import {
  configureAutoUpdate, printCodexHookTrust, printPlanSkeleton,
  REAL_SETUP_ENV, type SetupEnv, type SetupOpts,
} from './setupEnvironment.js'
import { bindNativeHostCommand } from './native-host-command-binding.js'
import { cmdSetupHost } from './setupHost.js'
import { cmdSetupSkills } from './setupSkills.js'
import { cmdSetupRuntime, REAL_RUNTIME_ENV, type RuntimeEnv } from './setupRuntime.js'
import { printCodexAuthGuidance } from '../codexAuth.js'
export function cmdSetup(
  deps: CliDeps,
  sub: string | undefined,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  rt: RuntimeEnv = REAL_RUNTIME_ENV,
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
  dashboardStarter: ReleasedDashboardStarter = REAL_RELEASED_DASHBOARD_STARTER,
): number | Promise<number> {
  const o: SetupOpts = { ...opts, dryRun: opts.dryRun ?? false, yes: opts.yes ?? false, autoUpdate: opts.autoUpdate ?? false }
  switch (sub) {
    case undefined:
    case '': {
      const selection = selectPipelineHost(o)
      if (selection.host === null) {
        deps.io.err(`ERROR: ${selection.error}。示例：tenon setup --codex`)
        return 1
      }
      const host = selection.host
      const nativeBinding = isNativePipelineHost(host) && !o.dryRun
        ? env.resolveHostCommand(host)
        : undefined
      const lifecycleEnv = nativeBinding === undefined
        ? env
        : bindNativeHostCommand(env, host as NativePipelineHost, nativeBinding)
      const finish = (hostCode: number): number | Promise<number> => {
        if (hostCode !== 0) return hostCode
        const finishSetup = (): number | Promise<number> => {
          // 全流程一条命令:所选 host → 内置技能验证 → 运行时就绪清单。
          // 运行时段 dry-run **只提示不真探测**（避免 buildProgram 单测经空 sub 起真 docker 子进程）;
          // 非 dry-run 才经注入 rt 真探测。技能段先同步跑完再接运行时异步段,故非 dry-run 返 Promise。
          printPlanSkeleton(deps, o, host)
          const skillsCode = cmdSetupSkills(deps, o, env)
          if (o.dryRun) {
            deps.io.out(
              '[setup] 运行时就绪检查:--dry-run 跳过真探测（不起 docker）——跑 tenon setup runtime ' +
                '看真实 docker/镜像/两 runner 凭证就绪清单',
            )
            return skillsCode
          }
          // 非 dry-run:技能段之后真跑运行时就绪清单;退出码取技能段(强制失败)优先,运行时恒 0 不改判。
          return cmdSetupRuntime(deps, o, rt).then((rtCode) => (skillsCode !== 0 ? skillsCode : rtCode))
        }
        if (host !== 'codex' || o.dryRun) return finishSetup()
        return lifecycleEnv.codexAuthStatus(nativeBinding?.executable)
          .catch(() => ({ state: 'unavailable', reason: 'spawn-error' } as const))
          .then((status) => {
            printCodexAuthGuidance(deps.io, status)
            return finishSetup()
          })
      }
      const runHost = (): number | Promise<number> => {
        const openDashboard = lifecycleEnv.isInteractive?.() ?? true
        const hostCode = cmdSetupHost(
          deps,
          host,
          o,
          lifecycleEnv,
          installer,
          dashboardStarter,
          openDashboard,
        )
        return typeof hostCode === 'number'
          ? finish(hostCode)
          : hostCode.then((code) => finish(code))
      }
      if (host !== 'codex' || o.dryRun) return runHost()
      if (nativeBinding === undefined) {
        printCodexAuthGuidance(deps.io, { state: 'unavailable', reason: 'cli-missing' })
        return 1
      }
      return runHost()
    }
    case 'skills':
      return cmdSetupSkills(deps, o, env)
    case 'runtime':
      return cmdSetupRuntime(deps, o, rt) // Promise<number>:真运行时段（docker/镜像/凭证就绪清单）
    default:
      deps.io.err(`ERROR: 未知 setup 子命令: ${sub}（支持: skills runtime,或不带子命令走全流程）`)
      return 1
  }
}


export {
  REAL_SETUP_ENV, resolvePipelineRoot, scrubLegacyCodexAdapterHooks, type LegacyCodexHookCleanup,
  type SetupEnv, type SetupOpts,
} from './setupEnvironment.js'
export { commandExistsOnPath } from './commandExists.js'
export { cmdSetupHost } from './setupHost.js'
export { verifyPackagedAssets } from './packaged-assets.js'
export { buildSkillsPlan, type CmdGroup, type PlannedCommand, type SkillsPlan } from './setupSkillsPlan.js'
export { cmdSetupSkills } from './setupSkills.js'
export { cmdSetupRuntime, REAL_RUNTIME_ENV, type RuntimeEnv } from './setupRuntime.js'
