import { mkdir, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { OWNED_MANIFEST, VERSION_FILE, parseOwnedManifest, serializeOwnedManifest } from './ownership-manifest.js'
import { UNKNOWN_VERSION } from './ownership-version.js'

export interface OwnedFs {
  readText: (abs: string) => Promise<string | undefined>
  writeText: (abs: string, content: string) => Promise<void>
  exists: (abs: string) => Promise<boolean>
  isDir: (abs: string) => Promise<boolean>
  unlink: (abs: string) => Promise<boolean>
  rmrf: (abs: string) => Promise<void>
  rmdirEmpty: (abs: string) => Promise<boolean>
  listDir: (abs: string) => Promise<string[]>
  homeDir: () => string
  homedirBypass: () => boolean
}

export function ownedManifestPath(cwd: string): string {
  return join(cwd, OWNED_MANIFEST)
}

export function readOwnedManifestText(fs: OwnedFs, cwd: string): Promise<string | undefined> {
  return fs.readText(ownedManifestPath(cwd))
}

export async function loadOwnedManifest(fs: OwnedFs, cwd: string): Promise<Record<string, string>> {
  const text = await readOwnedManifestText(fs, cwd)
  return text === undefined ? {} : parseOwnedManifest(text)
}

export function saveOwnedManifest(fs: OwnedFs, cwd: string, map: Record<string, string>): Promise<void> {
  return fs.writeText(ownedManifestPath(cwd), serializeOwnedManifest(map))
}

export async function readVersionFile(fs: OwnedFs, cwd: string): Promise<string> {
  const text = await fs.readText(join(cwd, VERSION_FILE))
  return text === undefined ? UNKNOWN_VERSION : text.trim() || UNKNOWN_VERSION
}

export function createOwnedFs(): OwnedFs {
  return {
    readText: async (abs) => {
      try { return await readFile(abs, 'utf8') } catch { return undefined }
    },
    writeText: async (abs, content) => {
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf8')
    },
    exists: async (abs) => {
      try { await stat(abs); return true } catch { return false }
    },
    isDir: async (abs) => {
      try { return (await stat(abs)).isDirectory() } catch { return false }
    },
    unlink: async (abs) => {
      try { await unlink(abs); return true } catch { return false }
    },
    rmrf: async (abs) => {
      await rm(abs, { recursive: true, force: true }).catch(() => {})
    },
    rmdirEmpty: async (abs) => {
      try { await rmdir(abs); return true } catch { return false }
    },
    listDir: async (abs) => {
      try { return await readdir(abs) } catch { return [] }
    },
    homeDir: () => homedir(),
    homedirBypass: () => process.env.PIPELINE_ALLOW_HOMEDIR === '1',
  }
}
