export type Obj = Record<string, unknown>

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function missing(value: Obj, key: string): boolean {
  return !(key in value) || value[key] === undefined
}

export function checkStr(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 string）`)
    return
  }
  if (typeof value[key] !== 'string') errors.push(`${path}.${key}: 应为 string，实得 ${typeName(value[key])}`)
}

export function checkNum(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 number）`)
    return
  }
  if (typeof value[key] !== 'number') errors.push(`${path}.${key}: 应为 number，实得 ${typeName(value[key])}`)
}

export function checkBool(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 boolean）`)
    return
  }
  if (typeof value[key] !== 'boolean') errors.push(`${path}.${key}: 应为 boolean，实得 ${typeName(value[key])}`)
}

export function checkKnownKeys(value: Obj, allowed: readonly string[], path: string, errors: string[]): void {
  const known = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!known.has(key)) errors.push(`${path}.${key}: 未知字段`)
  }
}

export function checkEnum(
  value: Obj, key: string, allowed: readonly string[], path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填，闭集 ${allowed.join('|')}）`)
    return
  }
  const item = value[key]
  if (typeof item !== 'string' || !allowed.includes(item)) {
    errors.push(`${path}.${key}: 应在闭集 [${allowed.join('|')}] 内，实得 ${JSON.stringify(item)}`)
  }
}

export function checkLit(
  value: Obj, key: string, literal: unknown, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填字面量 ${JSON.stringify(literal)}）`)
    return
  }
  if (value[key] !== literal) {
    errors.push(`${path}.${key}: 应为字面量 ${JSON.stringify(literal)}，实得 ${JSON.stringify(value[key])}`)
  }
}

export function checkStrArray(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 string[]）`)
    return
  }
  const items = value[key]
  if (!Array.isArray(items)) {
    errors.push(`${path}.${key}: 应为 string[]，实得 ${typeName(items)}`)
    return
  }
  items.forEach((item, index) => {
    if (typeof item !== 'string') errors.push(`${path}.${key}[${index}]: 应为 string，实得 ${typeName(item)}`)
  })
}

export function subObj(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): Obj | null {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填对象）`)
    return null
  }
  const child = value[key]
  if (!isObj(child)) {
    errors.push(`${path}.${key}: 应为对象，实得 ${typeName(child)}`)
    return null
  }
  return child
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/

export function checkSha256(
  value: Obj, key: string, path: string, errors: string[], optional = false,
): void {
  if (missing(value, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 sha256）`)
    return
  }
  const digest = value[key]
  if (typeof digest !== 'string') {
    errors.push(`${path}.${key}: 应为 string，实得 ${typeName(digest)}`)
    return
  }
  if (!SHA256_HEX_RE.test(digest)) {
    errors.push(`${path}.${key}: 应为 64 位小写十六进制 sha256，实得 ${JSON.stringify(digest)}`)
  }
}

export function checkPattern(
  value: Obj, key: string, pattern: RegExp, path: string, errors: string[],
): void {
  if (missing(value, key)) {
    errors.push(`${path}.${key}: 缺失（必填，须匹配 ${pattern.source}）`)
    return
  }
  const item = value[key]
  if (typeof item !== 'string') {
    errors.push(`${path}.${key}: 应为 string，实得 ${typeName(item)}`)
    return
  }
  if (!pattern.test(item)) errors.push(`${path}.${key}: 不匹配词法 ${pattern.source}，实得 ${JSON.stringify(item)}`)
}

export function checkSlotArray(value: Obj, key: string, path: string, errors: string[]): void {
  if (missing(value, key)) {
    errors.push(`${path}.${key}: 缺失（必填数组，允许为空）`)
    return
  }
  const slots = value[key]
  if (!Array.isArray(slots)) {
    errors.push(`${path}.${key}: 应为数组，实得 ${typeName(slots)}`)
    return
  }
  slots.forEach((item, index) => {
    const itemPath = `${path}.${key}[${index}]`
    if (!isObj(item)) {
      errors.push(`${itemPath}: 应为对象，实得 ${typeName(item)}`)
      return
    }
    checkStr(item, 'token', itemPath, errors)
    checkStrArray(item, 'alternatives', itemPath, errors)
    checkStr(item, 'concrete_skill_id', itemPath, errors)
    checkSha256(item, 'tree_sha256', itemPath, errors)
  })
}
