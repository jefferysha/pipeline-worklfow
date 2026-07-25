import type {
  AutomationStarterTemplate,
  OperationResponse,
  WbAfkReadiness,
  WbAutomationSettings,
  WbCadenceLoopState,
  WbCadenceLoopStatus,
  WbCadenceStatus,
  WbDockerImages,
  WbSecretLight,
  WbSecretsKeys,
} from './automationTypes'
import { isRecord, nullableString, optionalString, stringArray } from './transport'

function isCadenceState(value: unknown): value is WbCadenceLoopState {
  return value === 'inactive'
    || value === 'continuous'
    || value === 'waiting'
    || value === 'in-flight'
    || value === 'running'
    || value === 'succeeded'
    || value === 'failed'
    || value === 'blocked'
}

export function decodeOperationResponse(value: unknown): OperationResponse | null {
  if (!isRecord(value)
    || typeof value.ok !== 'boolean'
    || typeof value.exit_code !== 'number'
    || !stringArray(value.command)
    || typeof value.stdout !== 'string'
    || typeof value.stderr !== 'string'
    || !Object.prototype.hasOwnProperty.call(value, 'result')) return null
  return {
    ok: value.ok,
    exit_code: value.exit_code,
    command: value.command,
    result: value.result ?? null,
    stdout: value.stdout,
    stderr: value.stderr,
  }
}

export function decodeCadenceStatus(value: unknown): WbCadenceStatus | null {
  if (!isRecord(value)
    || value.enabled !== true
    || typeof value.poll_interval_ms !== 'number'
    || typeof value.generated_at !== 'string'
    || typeof value.running !== 'boolean'
    || !stringArray(value.errors)
    || !Array.isArray(value.loops)) return null
  const loops: WbCadenceLoopStatus[] = []
  for (const loop of value.loops) {
    if (!isRecord(loop)
      || typeof loop.root !== 'string'
      || typeof loop.loop_id !== 'string'
      || typeof loop.cadence !== 'string'
      || typeof loop.runner !== 'string'
      || !isCadenceState(loop.state)
      || !nullableString(loop.last_finished_at)
      || !nullableString(loop.due_at)
      || !optionalString(loop.attempted_at)
      || (loop.exit_code !== undefined && typeof loop.exit_code !== 'number')
      || !optionalString(loop.error)) return null
    loops.push({
      root: loop.root,
      loop_id: loop.loop_id,
      cadence: loop.cadence,
      runner: loop.runner,
      state: loop.state,
      last_finished_at: loop.last_finished_at,
      due_at: loop.due_at,
      ...(loop.attempted_at === undefined ? {} : { attempted_at: loop.attempted_at }),
      ...(loop.exit_code === undefined ? {} : { exit_code: loop.exit_code }),
      ...(loop.error === undefined ? {} : { error: loop.error }),
    })
  }
  return {
    enabled: true,
    poll_interval_ms: value.poll_interval_ms,
    generated_at: value.generated_at,
    running: value.running,
    loops,
    errors: value.errors,
  }
}

export function decodeAutomationSettings(value: unknown): WbAutomationSettings | null {
  if (!isRecord(value)
    || (value.enabled !== undefined && typeof value.enabled !== 'boolean')
    || typeof value.max_parallel !== 'number'
    || typeof value.max_retries !== 'number'
    || typeof value.default_opt_in !== 'boolean'
    || typeof value.image !== 'string') return null
  return {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    max_parallel: value.max_parallel,
    max_retries: value.max_retries,
    default_opt_in: value.default_opt_in,
    image: value.image,
  }
}

export function decodeAutomationSettingsEnvelope(value: unknown): WbAutomationSettings | null {
  return isRecord(value) ? decodeAutomationSettings(value.settings) : null
}

export function decodeStarters(value: unknown): AutomationStarterTemplate[] | null {
  if (!isRecord(value) || !Array.isArray(value.templates)) return null
  const templates: AutomationStarterTemplate[] = []
  for (const template of value.templates) {
    if (!isRecord(template)
      || template.version !== 1
      || typeof template.id !== 'string'
      || typeof template.goal !== 'string'
      || !Array.isArray(template.trigger)
      || (template.risk !== 'low' && template.risk !== 'medium' && template.risk !== 'high')
      || template.recommendedWorkflow !== 'default'
      || !stringArray(template.recommendedSkills)) return null
    const trigger: AutomationStarterTemplate['trigger'] = []
    for (const item of template.trigger) {
      if (!isRecord(item) || (item.kind !== 'schedule' && item.kind !== 'event' && item.kind !== 'manual')) return null
      trigger.push({ kind: item.kind })
    }
    templates.push({
      version: 1,
      id: template.id,
      goal: template.goal,
      trigger,
      risk: template.risk,
      recommendedWorkflow: 'default',
      recommendedSkills: template.recommendedSkills,
    })
  }
  return templates
}

export function decodeProjection(value: unknown): { ok: true; projection: { status: string; [key: string]: unknown } } | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.projection) || typeof value.projection.status !== 'string') {
    return null
  }
  return { ok: true, projection: { ...value.projection, status: value.projection.status } }
}

export function decodeDockerImages(value: unknown): WbDockerImages | null {
  if (!isRecord(value) || typeof value.available !== 'boolean' || !stringArray(value.images)) return null
  return { available: value.available, images: value.images }
}

function decodeCred(value: unknown): { set: boolean; source?: 'host-env' | 'secrets-file' | 'default-home' } | null {
  if (!isRecord(value)
    || typeof value.set !== 'boolean'
    || (value.source !== undefined
      && value.source !== 'host-env'
      && value.source !== 'secrets-file'
      && value.source !== 'default-home')) return null
  return {
    set: value.set,
    ...(value.source === undefined ? {} : { source: value.source }),
  }
}

export function decodeAfkReadiness(value: unknown): WbAfkReadiness | null {
  if (!isRecord(value)
    || !isRecord(value.docker)
    || typeof value.docker.available !== 'boolean'
    || !isRecord(value.image)
    || typeof value.image.configured !== 'string'
    || typeof value.image.present !== 'boolean'
    || typeof value.image.build_hint !== 'string'
    || !isRecord(value.credentials)
    || !isRecord(value.credentials['claude-code'])
    || !isRecord(value.credentials.codex)) return null
  const claude = decodeCred(value.credentials['claude-code'].CLAUDE_CODE_OAUTH_TOKEN)
  const openai = decodeCred(value.credentials.codex.OPENAI_API_KEY)
  const codexHome = decodeCred(value.credentials.codex.CODEX_HOME)
  if (!claude || !openai || !codexHome) return null
  return {
    docker: { available: value.docker.available },
    image: {
      configured: value.image.configured,
      present: value.image.present,
      build_hint: value.image.build_hint,
    },
    credentials: {
      'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: claude },
      codex: { OPENAI_API_KEY: openai, CODEX_HOME: codexHome },
    },
  }
}

function decodeSecret(value: unknown): WbSecretLight | null {
  if (!isRecord(value) || typeof value.set !== 'boolean' || !optionalString(value.masked)) return null
  return { set: value.set, ...(value.masked === undefined ? {} : { masked: value.masked }) }
}

export function decodeSecrets(value: unknown): WbSecretsKeys | null {
  if (!isRecord(value) || !isRecord(value.keys)) return null
  const claude = decodeSecret(value.keys.CLAUDE_CODE_OAUTH_TOKEN)
  const openai = decodeSecret(value.keys.OPENAI_API_KEY)
  return claude && openai ? { CLAUDE_CODE_OAUTH_TOKEN: claude, OPENAI_API_KEY: openai } : null
}
