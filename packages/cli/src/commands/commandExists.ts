import { accessSync, constants as fsConstants, statSync } from 'node:fs'
import { posix, win32 } from 'node:path'

export interface CommandExistsOptions {
  readonly pathValue?: string
  readonly pathExt?: string
  readonly platform?: NodeJS.Platform
  /** Exclude empty/current-directory and relative PATH entries for executable authority. */
  readonly requireAbsolutePathEntries?: boolean
}

/**
 * Resolve a PATH command to the exact executable file without executing it. Generic discovery
 * preserves normal PATH semantics (including project-local tool directories). Security boundaries
 * must opt into `requireAbsolutePathEntries`, which excludes the current directory and relative
 * entries. stat follows symlinks, so directories are rejected and a symlink is accepted only when
 * its target is a regular executable file.
 */
export function resolveCommandOnPath(
  name: string,
  options: CommandExistsOptions = {},
): string | undefined {
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const candidates = platform === 'win32' && pathApi.extname(name) === ''
    ? [
        name,
        ...(options.pathExt ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .filter((extension) => extension !== '')
          .map((extension) => `${name}${extension}`),
      ]
    : [name]
  const pathValue = options.pathValue ?? process.env.PATH ?? ''
  for (const dir of pathValue.split(platform === 'win32' ? ';' : ':')) {
    if (options.requireAbsolutePathEntries === true && (dir === '' || !pathApi.isAbsolute(dir))) {
      continue
    }
    for (const candidate of candidates) {
      const path = pathApi.resolve(dir === '' ? '.' : dir, candidate)
      try {
        if (!statSync(path).isFile()) continue
        accessSync(path, fsConstants.X_OK)
        return path
      } catch {
        // Continue through PATH and Windows PATHEXT candidates.
      }
    }
  }
  return undefined
}

export function commandExistsOnPath(
  name: string,
  options: CommandExistsOptions = {},
): boolean {
  return resolveCommandOnPath(name, options) !== undefined
}
