/**
 * paths —— channel scope + Project 桶解析（纯逻辑，env 注入）。
 * 存储模型：每个 channel 是一个目录
 *   <root>/<bucket>/<channel>/{events.jsonl, .seq, <name>.lock}
 *   · root   = Tenon 平台状态根下的 channels，$TENON_CHANNEL_ROOT 可显式覆盖
 *   · bucket = project 桶 key（cwd sanitize，仿 Claude Code）；TENON_CHANNEL_PROJECT 可覆盖
 *   · scope  = project（默认，绑 cwd 桶）/ global（_global 桶）
 *
 * 零第三方依赖（仅 node:path）。env 注入而非直读 process.env——纯逻辑、可测、可跨机重放。
 */
import { isAbsolute, join, resolve } from 'node:path'
import type { Scope } from './types.js'

export const GLOBAL_BUCKET = '_global'

/**
 * 桶/env 解析上下文。root/cwd 已解析好传入（store 从 process.env/homedir 装配，测试注入 fake）；
 * projectOverride 对应 $TENON_CHANNEL_PROJECT（supervisor 传桶，最高优先）。
 */
export interface ChannelEnv {
  /** 已解析的 channel 根目录（见 resolveRoot）。 */
  root: string
  /** project 桶来源的 cwd（绝对或相对，projectKey 内 resolve）。 */
  cwd: string
  /** $TENON_CHANNEL_PROJECT 覆盖桶（可选）。 */
  projectOverride?: string
}

/** channel 根：显式覆盖优先，否则直接使用产品路径模型提供的标准根。 */
export function resolveRoot(defaultRoot: string, envRoot: string | undefined): string {
  const env = (envRoot ?? '').trim()
  if (env) return env
  return defaultRoot
}

/** [\\/_]→'-' → 非 [A-Za-z0-9.-]→'-'。空 → '-'。 */
export function sanitizeBucket(s: string): string {
  const folded = s.replace(/[\\/_]/g, '-').replace(/[^A-Za-z0-9.-]/g, '-')
  return folded || '-'
}

/** Project 桶 key：projectOverride 覆盖（也 sanitize，防注入）否则 abspath(cwd) sanitize。 */
export function projectKey(env: ChannelEnv): string {
  const override = (env.projectOverride ?? '').trim()
  if (override) return sanitizeBucket(override)
  const base = isAbsolute(env.cwd) ? env.cwd : resolve(env.cwd)
  return sanitizeBucket(base)
}

/** scope → 桶名。project=cwd 桶；global=_global。 */
export function bucketFor(env: ChannelEnv, scope: Scope): string {
  return scope === 'global' ? GLOBAL_BUCKET : projectKey(env)
}

/** 某 channel 的目录绝对路径（不创建）。 */
export function channelDir(env: ChannelEnv, name: string, scope: Scope = 'project'): string {
  return join(env.root, bucketFor(env, scope), name)
}

export function bucketDir(env: ChannelEnv, scope: Scope = 'project'): string {
  return join(env.root, bucketFor(env, scope))
}

export function eventsPath(env: ChannelEnv, name: string, scope: Scope = 'project'): string {
  return join(channelDir(env, name, scope), 'events.jsonl')
}

export function seqPath(env: ChannelEnv, name: string, scope: Scope = 'project'): string {
  return join(channelDir(env, name, scope), '.seq')
}

export function lockPath(env: ChannelEnv, name: string, scope: Scope = 'project'): string {
  return join(channelDir(env, name, scope), `${name}.lock`)
}

/**
 * 某 worker 的 supervisor 运行时件路径。
 * 形如 <channel-dir>/<worker>.<suffix>，suffix ∈ pid/worker-pid/config/inbox-cursor/shutdown-reason/...
 * （纯运行时件、gitignore 不入库）。不创建，仅解析。
 */
export function workerFile(
  env: ChannelEnv,
  name: string,
  worker: string,
  suffix: string,
  scope: Scope = 'project',
): string {
  return join(channelDir(env, name, scope), `${worker}.${suffix}`)
}
