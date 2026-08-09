import { lstat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  computeInteractionScorecard,
  decodeInteractionEvent,
  InteractionEventSchemaError,
  INTERACTION_DIAGNOSTICS,
  INTERACTION_CONTROL_STAGES,
  INTERACTION_EXECUTION_MODES,
  INTERACTION_EVENT_SCHEMA,
  INTERACTION_PIPELINE_STAGES,
  INTERACTION_SURFACES,
  INTERACTION_TRACK_KINDS,
  INTERACTION_WORKFLOW_MODES,
  decodeUtf8Text,
  readBoundedRegularFile,
  type InteractionDiagnosticCode,
  type InteractionFixtureManifest,
  type InteractionScorecardInput,
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'

const MAX_FIXTURE_BYTES = 1024 * 1024
const MAX_EVENT_FILE_BYTES = 1024 * 1024
const MAX_FIXTURES = 256
// Fixtures are deliberately flat basenames. This closes ancestor-symlink traversal and keeps
// physical identity checks unambiguous without echoing or resolving attacker-controlled paths.
const SAFE_RELATIVE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/
const SAFE_FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} invalid`)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} invalid`)
  return value
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} invalid`)
  return value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort()
  const allowed = [...expected].sort()
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    throw new Error(`${label} fields invalid`)
  }
}

function exactDimension(value: unknown, expected: readonly string[], label: string): readonly string[] {
  const values = arrayValue(value, label)
  if (!values.every((item): item is string => typeof item === 'string')
    || values.length !== expected.length
    || values.some((item, index) => item !== expected[index])
    || new Set(values).size !== values.length) {
    throw new Error(`${label} matrix invalid`)
  }
  return values
}

async function readRegularJson(path: string, maxBytes: number, label: string): Promise<unknown> {
  let entry
  try {
    entry = await lstat(path)
  } catch {
    throw new Error(`${label} unavailable`)
  }
  if (entry.isSymbolicLink() || !entry.isFile() || entry.size > maxBytes) throw new Error(`${label} unavailable`)
  let content: Buffer
  try {
    content = await readBoundedRegularFile(path, maxBytes, label)
  } catch {
    throw new Error(`${label} invalid`)
  }
  try {
    return JSON.parse(decodeUtf8Text(content, label)) as unknown
  } catch {
    throw new Error(`${label} invalid`)
  }
}

function assertFixturePath(root: string, file: string): string {
  if (isAbsolute(file) || file.includes('\\') || !SAFE_RELATIVE.test(file)) {
    throw new Error('fixture file path invalid')
  }
  const target = resolve(root, file)
  const rootRelative = relative(resolve(root), target)
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) throw new Error('fixture file path invalid')
  return target
}

function parseManifest(value: unknown): InteractionFixtureManifest {
  const raw = object(value, 'manifest')
  exactKeys(raw, ['schema', 'dimensions', 'fixtures'], 'manifest')
  if (raw.schema !== INTERACTION_EVENT_SCHEMA) throw new Error('manifest schema invalid')
  const dimensions = object(raw.dimensions, 'manifest dimensions')
  const dimensionsKeys = ['executionMode', 'workflowMode', 'trackKind', 'pipelineStage', 'controlStage', 'surface']
  exactKeys(dimensions, dimensionsKeys, 'manifest dimensions')
  const executionMode = exactDimension(dimensions.executionMode, INTERACTION_EXECUTION_MODES, 'manifest dimensions.executionMode')
  const workflowMode = exactDimension(dimensions.workflowMode, INTERACTION_WORKFLOW_MODES, 'manifest dimensions.workflowMode')
  const trackKind = exactDimension(dimensions.trackKind, INTERACTION_TRACK_KINDS, 'manifest dimensions.trackKind')
  const pipelineStage = exactDimension(dimensions.pipelineStage, INTERACTION_PIPELINE_STAGES, 'manifest dimensions.pipelineStage')
  const controlStage = exactDimension(dimensions.controlStage, INTERACTION_CONTROL_STAGES, 'manifest dimensions.controlStage')
  const surface = exactDimension(dimensions.surface, INTERACTION_SURFACES, 'manifest dimensions.surface')
  const fixtures = arrayValue(raw.fixtures, 'manifest fixtures')
  if (fixtures.length > MAX_FIXTURES) throw new Error('manifest fixtures limit exceeded')
  const ids = new Set<string>()
  const files = new Set<string>()
  return {
    schema: INTERACTION_EVENT_SCHEMA,
    dimensions: {
      executionMode: executionMode as InteractionFixtureManifest['dimensions']['executionMode'],
      workflowMode: workflowMode as InteractionFixtureManifest['dimensions']['workflowMode'],
      trackKind: trackKind as InteractionFixtureManifest['dimensions']['trackKind'],
      pipelineStage: pipelineStage as InteractionFixtureManifest['dimensions']['pipelineStage'],
      controlStage: controlStage as InteractionFixtureManifest['dimensions']['controlStage'],
      surface: surface as InteractionFixtureManifest['dimensions']['surface'],
    },
    fixtures: fixtures.map((entry) => {
      const item = object(entry, 'manifest fixture')
      exactKeys(item, ['id', 'mode', 'file', 'expected'], 'manifest fixture')
      const expected = object(item.expected, 'manifest expected')
      exactKeys(expected, ['valid', 'diagnostics'], 'manifest expected')
      const diagnostics = arrayValue(expected.diagnostics, 'manifest expected diagnostics')
        .map((code) => stringValue(code, 'diagnostic'))
      if (diagnostics.some((code) => !INTERACTION_DIAGNOSTICS.includes(code as InteractionDiagnosticCode))) {
        throw new Error('manifest diagnostic invalid')
      }
      if (typeof expected.valid !== 'boolean') throw new Error('manifest expected.valid invalid')
      const mode = item.mode
      if (mode !== 'measurement' && mode !== 'negative-control') throw new Error('manifest fixture mode invalid')
      const id = stringValue(item.id, 'fixture id')
      if (!SAFE_FIXTURE_ID.test(id)) throw new Error('manifest fixture id invalid')
      const file = stringValue(item.file, 'fixture file')
      if (ids.has(id) || files.has(file)) throw new Error('manifest fixture duplicate')
      ids.add(id)
      files.add(file)
      return {
        id,
        mode,
        file,
        expected: { valid: expected.valid, diagnostics: diagnostics as InteractionDiagnosticCode[] },
      }
    }),
  }
}

async function readFixture(root: string, entry: InteractionFixtureManifest['fixtures'][number]): Promise<InteractionScorecardInput> {
  const value = await readRegularJson(assertFixturePath(root, entry.file), MAX_EVENT_FILE_BYTES, 'fixture')
  const raw = object(value, 'fixture')
  exactKeys(raw, ['schema', 'fixture_id', 'events'], 'fixture')
  if (raw.schema !== INTERACTION_EVENT_SCHEMA || raw.fixture_id !== entry.id) throw new Error('fixture schema invalid')
  const events = arrayValue(raw.events, 'fixture events').map((event) => {
    try {
      return decodeInteractionEvent(event)
    } catch (error) {
      if (error instanceof InteractionEventSchemaError) throw new Error('event-schema-invalid')
      throw new Error('fixture event invalid')
    }
  })
  return { id: entry.id, mode: entry.mode, events, expected: entry.expected }
}

export async function cmdInteraction(
  deps: CliDeps,
  sub: string,
  args: readonly string[],
  opts: { readonly json?: boolean } = {},
): Promise<number> {
  if (sub !== 'scorecard' || args.length !== 1 || opts.json !== true) {
    deps.io.err('ERROR: 用法：tenon interaction scorecard <fixture-dir> --json')
    return 1
  }
  try {
    const fixtureDir = args[0]
    if (fixtureDir === undefined) throw new Error('fixture directory unavailable')
    let directory
    try {
      directory = await lstat(fixtureDir)
    } catch {
      throw new Error('fixture directory unavailable')
    }
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error('fixture directory unavailable')
    const manifest = parseManifest(await readRegularJson(join(fixtureDir, 'manifest.json'), MAX_FIXTURE_BYTES, 'manifest'))
    const orderedEntries = [...manifest.fixtures].sort((left, right) => left.id.localeCompare(right.id))
    const physicalFiles = new Set<string>()
    for (const entry of orderedEntries) {
      const target = assertFixturePath(fixtureDir, entry.file)
      let info
      try {
        info = await lstat(target)
      } catch {
        throw new Error('fixture unavailable')
      }
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('fixture unavailable')
      const identity = `${info.dev}:${info.ino}`
      if (physicalFiles.has(identity)) throw new Error('manifest fixture duplicate')
      physicalFiles.add(identity)
    }
    const inputs = await Promise.all(orderedEntries.map((entry) => readFixture(fixtureDir, entry)))
    const scorecard = computeInteractionScorecard(inputs)
    for (const [index, entry] of orderedEntries.entries()) {
      const observed = scorecard.fixtures[index]
      const expected = entry.expected
      if (observed === undefined || observed.valid !== expected.valid
        || observed.diagnostics.join(',') !== [...expected.diagnostics].sort().join(',')) {
        throw new Error('fixture expected diagnostics mismatch')
      }
    }
    deps.io.out(JSON.stringify(scorecard))
    return 0
  } catch (error) {
    deps.io.err(`ERROR: interaction scorecard unavailable (${errMsg(error)})`)
    return 1
  }
}
