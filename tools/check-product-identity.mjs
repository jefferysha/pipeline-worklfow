import { readFile } from 'node:fs/promises'
import {
  readProductIdentity,
  renderProductIdentity,
} from './generate-product-identity.mjs'

const targetUrl = new URL('../packages/kernel/src/product-identity.generated.ts', import.meta.url)
const expected = renderProductIdentity(await readProductIdentity())
const actual = await readFile(targetUrl, 'utf8')

if (actual !== expected) {
  console.error('product identity projection is stale; run npm run generate:identity')
  process.exitCode = 1
}
