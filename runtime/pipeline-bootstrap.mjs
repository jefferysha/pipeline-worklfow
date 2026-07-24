#!/usr/bin/env node
/*
 * Minimal managed-runtime bootstrap.
 *
 * This file deliberately has no imports from the plugin payload.  Host hooks and the stable CLI
 * launcher execute a copied slot of this file, which selects a verified payload release from local
 * runtime state.  Keep the accepted recovery grammar deliberately narrow: it is a repair
 * capability, not a workflow-policy bypass.
 */
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile, appendFile, readdir, stat, utimes } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'

const RELEASE_ID = /^sha256-[a-f0-9]{64}$/

function safeRoot(value) {
  return typeof value === 'string' && value.trim() !== '' && isAbsolute(value.trim()) ? resolve(value.trim()) : null
}

// A native host loads SKILL.md assets from its own immutable plugin cache, while this bootstrap
// deliberately executes hooks from the separately verified managed release. Capture the host
// provenance before childEnv pins PLUGIN_ROOT to the release, so evidence hooks can attest to the
// exact asset the host actually read without making that cache executable runtime state.
const HOST_PLUGIN_ROOT = safeRoot(process.env.PLUGIN_ROOT) ?? safeRoot(process.env.CLAUDE_PLUGIN_ROOT)

function safePathSegment(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : null
}

// Codex command hooks do not guarantee either plugin-root environment variable. The host does
// keep an installed plugin's assets under a deterministic cache identity, though. Derive that
// identity exclusively from the already-verified active payload, never from the command event.
async function codexPluginCacheRoot(payload) {
  try {
    const plugin = JSON.parse(await readFile(join(payload, '.codex-plugin', 'plugin.json'), 'utf8'))
    const marketplace = JSON.parse(await readFile(join(payload, '.agents', 'plugins', 'marketplace.json'), 'utf8'))
    if (!isRecord(plugin) || !isRecord(marketplace) || !Array.isArray(marketplace.plugins)) return null
    const pluginName = safePathSegment(plugin.name)
    const pluginVersion = safePathSegment(plugin.version)
    const marketplaceName = safePathSegment(marketplace.name)
    if (pluginName === null || pluginVersion === null || marketplaceName === null) return null
    const declared = marketplace.plugins.some((entry) => isRecord(entry) && entry.name === pluginName)
    if (!declared) return null
    const codexHome = safeRoot(process.env.CODEX_HOME) ?? join(homedir(), '.codex')
    return join(codexHome, 'plugins', 'cache', marketplaceName, pluginName, pluginVersion)
  } catch {
    return null
  }
}

function runtimePaths() {
  const override = safeRoot(process.env.PIPELINE_RUNTIME_HOME)
  const home = homedir()
  const platform = process.platform
  const dataRoot = safeRoot(process.env.PIPELINE_RUNTIME_DATA_ROOT)
    ?? (override !== null
      ? join(override, 'data')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'pipeline-lite')
        : platform === 'win32'
          ? join(safeRoot(process.env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'), 'pipeline-lite')
        : join(safeRoot(process.env.XDG_DATA_HOME) ?? join(home, '.local', 'share'), 'pipeline-lite'))
  const stateRoot = safeRoot(process.env.PIPELINE_RUNTIME_STATE_ROOT)
    ?? (override !== null
      ? join(override, 'state')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'pipeline-lite', 'state')
        : platform === 'win32'
          ? join(safeRoot(process.env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'), 'pipeline-lite', 'state')
        : join(safeRoot(process.env.XDG_STATE_HOME) ?? join(home, '.local', 'state'), 'pipeline-lite'))
  const configRoot = safeRoot(process.env.PIPELINE_RUNTIME_CONFIG_ROOT)
    ?? (override !== null
      ? join(override, 'config')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'pipeline-lite', 'config')
        : platform === 'win32'
          ? join(safeRoot(process.env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'), 'pipeline-lite', 'config')
          : join(safeRoot(process.env.XDG_CONFIG_HOME) ?? join(home, '.config'), 'pipeline-lite'))
  return {
    dataRoot,
    stateRoot,
    configRoot,
    releasesRoot: join(dataRoot, 'releases'),
    bootstrapRoot: join(dataRoot, 'bootstrap'),
    selectionPath: join(stateRoot, 'selection.json'),
    auditPath: join(stateRoot, 'audit.jsonl'),
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSelection(value) {
  if (!isRecord(value) || value.version !== 1 || typeof value.revision !== 'number'
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || (value.activeRelease !== null && !RELEASE_ID.test(value.activeRelease))
    || (value.previousRelease !== null && !RELEASE_ID.test(value.previousRelease))
    || typeof value.updatedAt !== 'string' || value.updatedAt === '') return null
  return value
}

async function readSelection(paths) {
  try {
    const parsed = parseSelection(JSON.parse(await readFile(paths.selectionPath, 'utf8')))
    return parsed === null ? null : parsed
  } catch {
    return null
  }
}

async function normalFile(path) {
  try {
    const item = await lstat(path)
    return item.isFile() && !item.isSymbolicLink()
  } catch {
    return false
  }
}

async function releasePayload(paths, releaseId) {
  if (!RELEASE_ID.test(releaseId)) return null
  const releaseRoot = join(paths.releasesRoot, releaseId)
  const manifestPath = join(releaseRoot, 'release.json')
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (!isRecord(manifest) || manifest.version !== 1 || manifest.releaseId !== releaseId
      || typeof manifest.payloadDigest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.payloadDigest)) return null
    const payload = join(releaseRoot, 'payload')
    const cli = join(payload, 'packages', 'cli', 'dist', 'pipeline.mjs')
    const bootstrap = join(payload, 'runtime', 'pipeline-bootstrap.mjs')
    if (!await normalFile(cli) || !await normalFile(bootstrap)) return null
    // Selection and manifest shape are not integrity proof. Recompute the immutable tree before
    // every execution boundary so a locally forged active payload enters recovery-only mode.
    if (await hashPayload(payload) !== manifest.payloadDigest) return null
    return { releaseRoot, payload }
  } catch {
    return null
  }
}

async function hashPayload(root) {
  const hash = createHash('sha256')
  async function visit(dir, rel) {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const child = join(dir, entry.name)
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      const item = await lstat(child)
      if (item.isSymbolicLink()) throw new Error(`payload contains symbolic link: ${childRel}`)
      if (item.isDirectory()) {
        hash.update(`D\u0000${childRel}\u0000`)
        await visit(child, childRel)
      } else if (item.isFile()) {
        hash.update(`F\u0000${childRel}\u0000${(item.mode & 0o777).toString(8)}\u0000`)
        hash.update(await readFile(child))
      } else {
        throw new Error(`payload contains unsupported entry: ${childRel}`)
      }
    }
  }
  await visit(root, '')
  return hash.digest('hex')
}

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function atomicWrite(path, text) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' })
    await rename(tmp, path)
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
}

async function installBootstrap(paths, releaseRoot) {
  const source = join(releaseRoot, 'payload', 'runtime', 'pipeline-bootstrap.mjs')
  if (!await normalFile(source)) throw new Error('previous release bootstrap is missing')
  await mkdir(paths.bootstrapRoot, { recursive: true })
  const active = join(paths.bootstrapRoot, 'active.mjs')
  const previous = join(paths.bootstrapRoot, 'previous.mjs')
  if (await normalFile(active)) {
    const tmpPrevious = `${previous}.tmp-${process.pid}-${Date.now()}`
    await copyFile(active, tmpPrevious)
    await rename(tmpPrevious, previous)
  }
  const tmpActive = `${active}.tmp-${process.pid}-${Date.now()}`
  await copyFile(source, tmpActive)
  await rename(tmpActive, active)
}

async function appendAudit(paths, entry) {
  await mkdir(dirname(paths.auditPath), { recursive: true })
  await appendFile(paths.auditPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

async function readLastAudit(paths) {
  try {
    const lines = (await readFile(paths.auditPath, 'utf8')).trim().split(/\r?\n/)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (line === undefined || line === '') continue
      const parsed = JSON.parse(line)
      if (isRecord(parsed) && parsed.version === 1 && typeof parsed.kind === 'string'
        && typeof parsed.at === 'string' && typeof parsed.detail === 'string') return parsed
    }
  } catch {
    // Missing or malformed audit history is reported as no last event; it never authorizes runtime.
  }
  return null
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

/**
 * Use the same state-root `.pipeline.lock` convention as the managed release store.  Recovery
 * lives in the bootstrap precisely because the active CLI may be broken, so it cannot import the
 * normal lock implementation; this small compatible adapter keeps activation and rollback from
 * publishing competing selections.
 */
async function withStateLock(paths, operation) {
  await mkdir(paths.stateRoot, { recursive: true })
  const lock = join(paths.stateRoot, '.pipeline.lock')
  const owner = join(lock, 'owner')
  const token = `${process.pid}.${randomBytes(8).toString('hex')}.${Date.now()}`
  const deadline = Date.now() + 10_000
  let acquired = false
  let heartbeat = null
  try {
    while (!acquired) {
      let created = false
      try {
        await mkdir(lock)
        created = true
        await writeFile(owner, `${token}\n`, { encoding: 'utf8', flag: 'wx' })
        acquired = true
        heartbeat = setInterval(() => {
          const now = new Date()
          void utimes(owner, now, now).catch(() => {})
        }, 20_000)
        if (typeof heartbeat.unref === 'function') heartbeat.unref()
      } catch (error) {
        if (created) {
          await rm(lock, { recursive: true, force: true }).catch(() => {})
          throw error
        }
        if ((error && typeof error === 'object' && error.code) !== 'EEXIST') throw error
        let age = null
        try {
          age = Date.now() - (await stat(owner)).mtimeMs
        } catch {
          try { age = Date.now() - (await stat(lock)).mtimeMs } catch { age = null }
        }
        if (age !== null && age > 60_000) {
          const grave = `${lock}.stale.${process.pid}.${randomBytes(6).toString('hex')}`
          try {
            await rename(lock, grave)
            await rm(grave, { recursive: true, force: true })
          } catch {
            // Another process either released or reclaimed it.  Retry the atomic mkdir.
          }
          continue
        }
        if (Date.now() >= deadline) throw new Error('runtime recovery lock acquisition timed out')
        await delay(25)
      }
    }
    return await operation()
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat)
    if (acquired) {
      let own = false
      try { own = (await readFile(owner, 'utf8')).trim() === token } catch { own = false }
      if (own) await rm(lock, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function rollback(paths) {
  return withStateLock(paths, async () => {
  const selection = await readSelection(paths)
  if (selection === null || selection.previousRelease === null) {
    throw new Error('no verified previous release is available; run pipeline setup --codex or pipeline setup --claude')
  }
  const previous = await releasePayload(paths, selection.previousRelease)
  if (previous === null) throw new Error('previous release integrity check failed; reinstall the selected host package')
  const manifest = JSON.parse(await readFile(join(previous.releaseRoot, 'release.json'), 'utf8'))
  if (!isRecord(manifest) || await hashPayload(previous.payload) !== manifest.payloadDigest) {
    throw new Error('previous release digest check failed; reinstall the selected host package')
  }
  await mkdir(paths.stateRoot, { recursive: true })
  const next = {
    version: 1,
    revision: selection.revision + 1,
    activeRelease: selection.previousRelease,
    previousRelease: selection.activeRelease,
    updatedAt: now(),
  }
  try {
    // Write-ahead audit: an audit append failure must leave bootstrap and selection untouched.
    await appendAudit(paths, {
      version: 1,
      at: now(),
      kind: 'rolled-back',
      releaseId: next.activeRelease,
      previousRelease: next.previousRelease,
      detail: 'verified bootstrap rollback prepared; selection publication follows under lock',
    })
    await installBootstrap(paths, previous.releaseRoot)
    await atomicWrite(paths.selectionPath, `${JSON.stringify(next, null, 2)}\n`)
    return next
  } catch (error) {
    await appendAudit(paths, {
      version: 1,
      at: now(),
      kind: 'rollback-rejected',
      releaseId: next.activeRelease,
      previousRelease: next.previousRelease,
      detail: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
    throw error
  }
  })
}

function recoveryCommand(input) {
  let parsed
  try { parsed = JSON.parse(input) } catch { return false }
  if (!isRecord(parsed) || (parsed.tool_name !== 'Bash' && parsed.tool_name !== 'command_execution')
    || typeof parsed.command !== 'string') return false
  // The gate authorizes the stable PATH command identity only. A matching basename at an
  // attacker-controlled absolute path is not the managed launcher and must remain denied.
  return parsed.command.trim() === 'pipeline runtime repair --rollback'
}

async function childEnv(payload, paths) {
  const env = {
    ...process.env,
    PLUGIN_ROOT: payload,
    CLAUDE_PLUGIN_ROOT: payload,
    PIPELINE_RUNTIME_DATA_ROOT: paths.dataRoot,
    PIPELINE_RUNTIME_STATE_ROOT: paths.stateRoot,
    PIPELINE_RUNTIME_CONFIG_ROOT: paths.configRoot,
  }
  if (HOST_PLUGIN_ROOT === null) delete env.PIPELINE_HOST_PLUGIN_ROOT
  else env.PIPELINE_HOST_PLUGIN_ROOT = HOST_PLUGIN_ROOT
  const codexCacheRoot = await codexPluginCacheRoot(payload)
  if (codexCacheRoot === null) delete env.PIPELINE_CODEX_PLUGIN_ROOT
  else env.PIPELINE_CODEX_PLUGIN_ROOT = codexCacheRoot
  return env
}

function exitFor(result) {
  if (typeof result.status === 'number') return result.status
  return result.error === undefined ? 0 : 1
}

async function emitBootstrapStatus(paths, asJson) {
  const selection = await readSelection(paths)
  const active = selection?.activeRelease === null || selection === null ? null : await releasePayload(paths, selection.activeRelease)
  const previous = selection?.previousRelease === null || selection === null ? null : await releasePayload(paths, selection.previousRelease)
  const payload = {
    selection,
    activeValid: active !== null,
    previousValid: previous !== null,
    bootstrap: join(paths.bootstrapRoot, 'active.mjs'),
    lastAudit: await readLastAudit(paths),
  }
  if (asJson) process.stdout.write(`${JSON.stringify(payload)}\n`)
  else {
    process.stdout.write(`[runtime] active=${selection?.activeRelease ?? 'none'} valid=${active === null ? 'no' : 'yes'}\n`)
    process.stdout.write(`[runtime] previous=${selection?.previousRelease ?? 'none'} valid=${previous === null ? 'no' : 'yes'} revision=${selection?.revision ?? 'unknown'}\n`)
    if (active === null) process.stdout.write('[runtime] 修复：pipeline runtime repair --rollback；或 pipeline setup --codex / --claude。\n')
  }
  return 0
}

async function runCli(paths, args) {
  if (args.length >= 2 && args[0] === 'runtime' && args[1] === 'repair' && args.length === 3 && args[2] === '--rollback') {
    try {
      const selection = await rollback(paths)
      process.stdout.write(`${JSON.stringify({ ok: true, selection })}\n`)
      return 0
    } catch (error) {
      process.stderr.write(`pipeline runtime repair: ${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }
  if (args.length >= 2 && args[0] === 'runtime' && args[1] === 'bootstrap-status') {
    const selection = await readSelection(paths)
    process.stdout.write(`${JSON.stringify({ selection, bootstrap: join(paths.bootstrapRoot, 'active.mjs') })}\n`)
    return selection === null ? 1 : 0
  }
  if (args.length >= 2 && args[0] === 'runtime' && args[1] === 'status'
    && (args.length === 2 || (args.length === 3 && args[2] === '--json'))) {
    return emitBootstrapStatus(paths, args[2] === '--json')
  }
  const selection = await readSelection(paths)
  const active = selection?.activeRelease === null || selection === null ? null : await releasePayload(paths, selection.activeRelease)
  if (active === null) {
    process.stderr.write('pipeline runtime is unavailable; run pipeline runtime repair --rollback or pipeline setup --<host>\n')
    return 1
  }
  const result = spawnSync(process.execPath, [join(active.payload, 'packages', 'cli', 'dist', 'pipeline.mjs'), ...args], {
    cwd: process.cwd(),
    env: await childEnv(active.payload, paths),
    stdio: 'inherit',
  })
  return exitFor(result)
}

async function runHook(paths, hookId) {
  const input = await new Promise((resolveInput) => {
    let text = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { text += chunk })
    process.stdin.on('end', () => resolveInput(text))
    process.stdin.on('error', () => resolveInput(text))
  })
  if (!/^[a-z0-9-]+$/.test(hookId)) return 0
  if (hookId === 'gate' && recoveryCommand(input)) return 0
  const selection = await readSelection(paths)
  const active = selection?.activeRelease === null || selection === null ? null : await releasePayload(paths, selection.activeRelease)
  if (active === null) {
    process.stderr.write('[pipeline-lite] managed runtime unavailable; normal project mutation is disabled until rollback or setup succeeds.\n')
    return hookId === 'gate' ? 2 : 0
  }
  const hook = join(active.payload, 'hooks', `${hookId}.sh`)
  if (!await normalFile(hook)) {
    process.stderr.write(`[pipeline-lite] active runtime hook is missing: ${hookId}\n`)
    return hookId === 'gate' ? 2 : 0
  }
  const result = spawnSync('bash', [hook], {
    cwd: process.cwd(),
    env: await childEnv(active.payload, paths),
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  return exitFor(result)
}

async function main() {
  const [mode, ...args] = process.argv.slice(2)
  const paths = runtimePaths()
  if (mode === 'cli') process.exitCode = await runCli(paths, args)
  else if (mode === 'hook' && args.length === 1) process.exitCode = await runHook(paths, args[0])
  else {
    process.stderr.write('pipeline bootstrap usage: cli <args...> | hook <hook-id>\n')
    process.exitCode = 2
  }
}

void main()
