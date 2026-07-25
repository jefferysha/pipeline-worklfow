import { lstat, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'

const MANIFEST_PATH = '.vite/manifest.json'

function artifactPath(value) {
  return typeof value === 'string'
    && value !== ''
    && !isAbsolute(value)
    && value !== '..'
    && !value.startsWith(`..${sep}`)
}

export async function manifestArtifactFiles(dist) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(resolve(dist, MANIFEST_PATH), 'utf8'))
  } catch (error) {
    throw new Error(`无法读取当前构建 manifest ${MANIFEST_PATH}: ${String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${MANIFEST_PATH} 必须是对象`)
  }

  const files = new Set([MANIFEST_PATH])
  for (const entry of Object.values(parsed)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${MANIFEST_PATH} entry 必须是对象`)
    }
    for (const key of ['file', 'css', 'assets']) {
      const value = entry[key]
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
      for (const candidate of values) {
        if (!artifactPath(candidate)) {
          throw new Error(`${MANIFEST_PATH} 包含不安全 artifact 路径: ${String(candidate)}`)
        }
        files.add(candidate)
        // VitePress emits a hydrated page module beside every manifest-listed lean page module.
        // The exact sibling name is derived from the same content hash; this is not an extension glob.
        if (key === 'file' && candidate.endsWith('.lean.js')) {
          files.add(candidate.replace(/\.lean\.js$/u, '.js'))
        }
      }
    }
  }
  return files
}

export async function auditArtifactFileSet(dist, expectedPublicFiles) {
  const errors = []
  const allowed = new Set(expectedPublicFiles)
  try {
    for (const file of await manifestArtifactFiles(dist)) allowed.add(file)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    return errors
  }

  const builtFiles = await readdir(dist, { recursive: true }).catch(() => [])
  for (const value of builtFiles) {
    const relativePath = String(value)
    const info = await lstat(resolve(dist, relativePath))
    if (info.isSymbolicLink()) {
      errors.push(`${relativePath}: artifact 不允许 symlink`)
      continue
    }
    if (!info.isFile()) continue
    if (!allowed.has(relativePath)) {
      errors.push(`${relativePath}: 不在当前构建的精确 artifact allowlist`)
    }
  }
  return errors.sort()
}
