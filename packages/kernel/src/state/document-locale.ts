import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentLocale } from '../types.js'
import { atomicLinkPublish } from './atomic-publish.js'

export const DOCUMENT_LOCALE_FILE = '.pipeline-document-locale.json'

export interface DocumentLocalePin {
  readonly version: 1
  readonly locale: DocumentLocale
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const value = Reflect.get(error, 'code')
  return typeof value === 'string' ? value : undefined
}

function parseDocumentLocalePin(raw: string): DocumentLocalePin {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('document locale pin 不是合法 JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('document locale pin 必须是对象')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'version' && key !== 'locale')
    || record.version !== 1
    || (record.locale !== 'zh-CN' && record.locale !== 'en')) {
    throw new Error('document locale pin 形状非法')
  }
  return { version: 1, locale: record.locale }
}

export async function readDocumentLocalePin(changeDir: string): Promise<DocumentLocalePin | undefined> {
  const target = join(changeDir, DOCUMENT_LOCALE_FILE)
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`document locale pin 必须是非 symlink 普通文件: ${target}`)
    }
    return parseDocumentLocalePin(await readFile(target, 'utf8'))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

export async function ensureDocumentLocalePin(
  changeDir: string,
  locale: DocumentLocale,
): Promise<DocumentLocalePin> {
  const existing = await readDocumentLocalePin(changeDir)
  if (existing !== undefined) {
    if (existing.locale !== locale) {
      throw new Error(`Change 已固定 document locale '${existing.locale}'，拒绝改为 '${locale}'`)
    }
    return existing
  }
  const pin: DocumentLocalePin = { version: 1, locale }
  const target = join(changeDir, DOCUMENT_LOCALE_FILE)
  try {
    await atomicLinkPublish(
      changeDir,
      '.pipeline-document-locale.tmp',
      target,
      `${JSON.stringify(pin)}\n`,
    )
    return pin
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const raced = await readDocumentLocalePin(changeDir)
    if (raced === undefined) throw new Error(`document locale pin 并发创建后不可读取: ${target}`)
    if (raced.locale !== locale) {
      throw new Error(`Change 已固定 document locale '${raced.locale}'，拒绝改为 '${locale}'`)
    }
    return raced
  }
}
