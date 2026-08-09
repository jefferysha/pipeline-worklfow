import { homedir } from 'node:os'
import type { ProductPathInput } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import type { RuntimeInspection } from '../runtime/types.js'
import { resolveCommandOnPath } from './commandExists.js'
import { freezeTrustedExecutable } from './trusted-executable.js'

export interface RuntimeCommandOpts {
  readonly json?: boolean
  readonly rollback?: boolean
}

export interface RuntimeCommandEnv {
  homeDir(): string
  runtimeEnv(): NonNullable<ProductPathInput['env']>
  resolveTrustedBash?(): string | undefined
  resolveTrustedNode?(): string | undefined
}

export const REAL_RUNTIME_COMMAND_ENV: RuntimeCommandEnv = {
  homeDir: () => homedir(),
  runtimeEnv: () => ({ ...process.env }),
  resolveTrustedBash: () => resolveCommandOnPath('bash', {
    pathValue: process.env.PATH,
    platform: process.platform,
    requireAbsolutePathEntries: true,
  }),
  // The stable launcher already selected this absolute Node executable. Runtime repair must
  // re-prove that exact physical program instead of resolving a potentially different PATH node.
  resolveTrustedNode: () => process.execPath,
}

function runtimeScope(env: RuntimeCommandEnv) {
  const requestedBashPath = env.resolveTrustedBash?.()
  if (env.resolveTrustedBash !== undefined && requestedBashPath === undefined) {
    throw new Error('可信 Bash 不可执行')
  }
  const trustedBash = requestedBashPath === undefined
    ? undefined
    : freezeTrustedExecutable(requestedBashPath)
  if (requestedBashPath !== undefined && trustedBash === undefined) {
    throw new Error('可信 Bash 物理身份不可证明')
  }
  const requestedNodePath = env.resolveTrustedNode?.()
  if (env.resolveTrustedNode !== undefined && requestedNodePath === undefined) {
    throw new Error('可信 Node 不可执行')
  }
  const trustedNode = requestedNodePath === undefined
    ? undefined
    : freezeTrustedExecutable(requestedNodePath)
  if (requestedNodePath !== undefined && trustedNode === undefined) {
    throw new Error('可信 Node 物理身份不可证明')
  }
  return {
    homeDir: env.homeDir(),
    env: env.runtimeEnv(),
    ...(trustedBash === undefined ? {} : {
      trustedBashPath: trustedBash.executable,
      verifyTrustedBash: trustedBash.assert,
    }),
    ...(trustedNode === undefined ? {} : {
      trustedNodePath: trustedNode.executable,
      trustedNodeProof: trustedNode.proof,
      verifyTrustedNode: trustedNode.assert,
    }),
  }
}

function statusPayload(inspection: RuntimeInspection): Record<string, unknown> {
  return {
    selection: inspection.selection,
    active: inspection.active,
    previous: inspection.previous,
    activeValid: inspection.activeValid,
    previousValid: inspection.previousValid,
    lastAudit: inspection.lastAudit,
    auditCorrupt: inspection.auditCorrupt === true,
    auditPending: inspection.auditPending === true,
  }
}

function renderStatus(deps: CliDeps, inspection: RuntimeInspection, asJson: boolean): void {
  const payload = statusPayload(inspection)
  if (asJson) {
    deps.io.out(JSON.stringify(payload))
    return
  }
  const active = inspection.selection.activeRelease ?? 'none'
  const previous = inspection.selection.previousRelease ?? 'none'
  deps.io.out(`[runtime] active=${active} valid=${inspection.activeValid ? 'yes' : 'no'}`)
  deps.io.out(`[runtime] previous=${previous} valid=${inspection.previousValid ? 'yes' : 'no'} revision=${inspection.selection.revision}`)
  if (inspection.lastAudit !== null) deps.io.out(`[runtime] last=${inspection.lastAudit.kind} at=${inspection.lastAudit.at}`)
  if (inspection.auditCorrupt === true) deps.io.out('[runtime] WARNING: audit.jsonl 不完整或格式损坏；不会回退展示更旧事件。')
  if (inspection.auditPending === true) deps.io.out('[runtime] DEGRADED: selection 已提交，但 terminal audit 仍待恢复；请重跑原命令。')
  if (!inspection.activeValid) {
    deps.io.out('[runtime] 修复：tenon runtime repair --rollback；若没有上一份已验证 release，运行 tenon setup --codex 或 tenon setup --claude。')
  }
}

export async function cmdRuntime(
  deps: CliDeps,
  sub: string | undefined,
  opts: RuntimeCommandOpts,
  env: RuntimeCommandEnv = REAL_RUNTIME_COMMAND_ENV,
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
): Promise<number> {
  if (sub === 'status') {
    try {
      renderStatus(deps, await installer.inspect(runtimeScope(env)), opts.json === true)
      return 0
    } catch (error) {
      deps.io.err(`ERROR: 无法读取 managed runtime 状态：${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  }
  if (sub === 'repair') {
    if (opts.rollback !== true) {
      deps.io.err('ERROR: runtime repair 只接受精确恢复动作：tenon runtime repair --rollback')
      return 1
    }
    try {
      const activation = await installer.rollback(runtimeScope(env))
      const payload = {
        ok: true,
        selection: activation.selection,
        release: activation.release,
      }
      if (opts.json) deps.io.out(JSON.stringify(payload))
      else deps.io.out(`[runtime] 已回滚到已验证 release ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
      return 0
    } catch (error) {
      deps.io.err(`ERROR: runtime 回滚失败：${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  }
  deps.io.err('ERROR: runtime 子命令仅支持 status 或 repair --rollback')
  return 1
}
