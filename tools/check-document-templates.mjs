#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDocumentPresentationAssets } from './document-presentation-schema.mjs'
import { generatedDocumentPresentationSource } from './generate-document-presentation.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const load = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const registry = await load('templates/documents/registry.v1.yaml')
const catalogs = await Promise.all(
  registry.locales.map((locale) => load(`templates/documents/locales/${locale}.yaml`)),
)
const errors = await validateDocumentPresentationAssets(root, registry, catalogs)
const ids = registry.templates.map((template) => template.id)
const baseline = catalogs.find((catalog) => catalog.locale === 'zh-CN')

const zhDelta = baseline?.templates?.['openspec-delta-spec']
if (zhDelta?.operations !== 'ADDED Requirements') {
  errors.push('zh-CN delta spec 必须保留 ADDED Requirements 机器 token')
}

const generatedPath = resolve(root, 'packages/kernel/src/documents/document-presentation.generated.ts')
const actualGenerated = await readFile(generatedPath, 'utf8').catch(() => '')
const expectedGenerated = await generatedDocumentPresentationSource()
if (actualGenerated !== expectedGenerated) {
  errors.push('Document Presentation 生成物过期；运行 node tools/generate-document-presentation.mjs')
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[document-templates] ${error}`)
  process.exitCode = 1
} else {
  console.log(`[document-templates] PASS: ${ids.length} templates × ${catalogs.length} locales，运行时由发行资产生成`)
}
