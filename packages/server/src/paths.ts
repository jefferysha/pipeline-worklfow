import { join } from 'node:path'
import { resolveProductPaths, type ProductPathInput } from '@tenon/kernel'
import type { ServerPaths } from './types.js'

export function resolveServerPaths(opts: {
  readonly home?: string
  readonly env?: ProductPathInput['env']
  readonly platform?: NodeJS.Platform
} = {}): ServerPaths {
  const product = resolveProductPaths({
    ...(opts.home === undefined ? {} : { homeDir: opts.home }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    ...(opts.platform === undefined ? {} : { platform: opts.platform }),
  })
  return {
    ...product,
    claudeDir: join(product.homeDir, '.claude'),
    tokenPath: product.dashboardTokenPath,
    pidfilePath: product.dashboardPidfilePath,
  }
}
