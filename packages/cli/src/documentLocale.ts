import {
  ensureDocumentLocalePin,
  readDocumentLocalePin,
  type DocumentLocale,
} from '@tenon/kernel'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function inferLegacyDocumentLocale(changeDirPath: string): Promise<DocumentLocale | undefined> {
  let chinese = 0
  let english = 0
  let observedDocument = false
  for (const name of ['proposal.md', 'design.md', 'tasks.md'] as const) {
    try {
      const content = await readFile(resolve(changeDirPath, name), 'utf8')
      observedDocument = true
      const heading = content.match(/^#\s+(.+?)\s*$/mu)?.[1] ?? ''
      const hasChinese = /\p{Script=Han}/u.test(heading)
      const hasEnglish = /[A-Za-z]/u.test(heading)
      if (hasChinese && hasEnglish) {
        throw new Error(`旧 Change 的 ${name} H1 混用中英文，无法可靠判断 document locale`)
      }
      if (hasChinese) chinese += 1
      if (hasEnglish) english += 1
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  if (chinese > 0 && english > 0) {
    throw new Error('旧 Change 的现有文档语言不一致；请显式指定 zh-CN 或 en')
  }
  if (english > 0) return 'en'
  if (chinese > 0) return 'zh-CN'
  if (observedDocument) {
    throw new Error('旧 Change 的现有文档 H1 没有足够语言信号，无法可靠判断 document locale')
  }
  return undefined
}

export async function resolveChangeDocumentLocale(
  changeDirPath: string,
  requestedLocale?: string,
  pinLegacy = false,
): Promise<DocumentLocale> {
  if (requestedLocale !== undefined && requestedLocale !== 'zh-CN' && requestedLocale !== 'en') {
    throw new Error(`不支持 document locale '${requestedLocale}'`)
  }
  const pinned = await readDocumentLocalePin(changeDirPath)
  if (pinned !== undefined) {
    if (requestedLocale !== undefined && requestedLocale !== pinned.locale) {
      throw new Error(`Change 已固定 document locale '${pinned.locale}'，拒绝改为 '${requestedLocale}'`)
    }
    return pinned.locale
  }
  const inferred = await inferLegacyDocumentLocale(changeDirPath)
  if (requestedLocale !== undefined && inferred !== undefined && requestedLocale !== inferred) {
    throw new Error(`旧 Change 文档已是 '${inferred}'，拒绝固定为 '${requestedLocale}'`)
  }
  const locale = requestedLocale ?? inferred ?? 'zh-CN'
  if (pinLegacy && requestedLocale === undefined && inferred === undefined) {
    throw new Error('旧 Change 缺少可推断的治理文档；请显式指定 zh-CN 或 en')
  }
  if (pinLegacy) await ensureDocumentLocalePin(changeDirPath, locale)
  return locale
}
