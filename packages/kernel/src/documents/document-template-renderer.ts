import {
  DOCUMENT_LOCALES,
  DOCUMENT_LOCALE_CATALOGS,
  DOCUMENT_PRESENTATION_REGISTRY,
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_WORKFLOW_STEP_IDS,
  DOCUMENT_WORKFLOW_STEP_LABELS,
  type DocumentLocale,
  type DocumentTemplateId,
} from './document-presentation-registry.js'

export {
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_WORKFLOW_STEP_IDS,
  DOCUMENT_WORKFLOW_STEP_LABELS,
} from './document-presentation-registry.js'
export const DEFAULT_DOCUMENT_LOCALE: DocumentLocale = 'zh-CN'

export interface WorkflowStepPresentation {
  readonly id: string
  readonly label?: string
}

export interface DocumentTemplateVariables {
  readonly change: string
  readonly workflowStepLabelSource?: 'localized-builtin' | 'workflow-defined'
  readonly workflowSteps?: readonly WorkflowStepPresentation[]
  readonly designDoc?: string
}

export interface DocumentPathVariables {
  readonly change: string
  readonly capability?: string
}

function isLocale(value: string): value is DocumentLocale {
  return (DOCUMENT_LOCALES as readonly string[]).includes(value)
}

function section(catalog: Readonly<Record<string, string>>, key: string): string {
  const value = catalog[key]
  if (value === undefined || value.trim() === '') {
    throw new Error(`Document Presentation Registry 缺少 section '${key}'`)
  }
  return value
}

export function validateDocumentPresentationRegistry(): void {
  const templateIds = Object.keys(DOCUMENT_PRESENTATION_REGISTRY.templates).sort()
  const expected = [...DOCUMENT_TEMPLATE_IDS].sort()
  if (JSON.stringify(templateIds) !== JSON.stringify(expected)) {
    throw new Error('Document Presentation Registry template id 不完整')
  }
  const baseline = DOCUMENT_LOCALE_CATALOGS[DEFAULT_DOCUMENT_LOCALE]
  for (const locale of DOCUMENT_LOCALES) {
    const workflowLabels: Readonly<Record<string, string>> = DOCUMENT_WORKFLOW_STEP_LABELS[locale]
    const observedWorkflowSteps = Object.keys(workflowLabels).sort()
    const expectedWorkflowSteps = [...DOCUMENT_WORKFLOW_STEP_IDS].sort()
    if (JSON.stringify(observedWorkflowSteps) !== JSON.stringify(expectedWorkflowSteps)) {
      throw new Error(`locale '${locale}' workflow step label 与 Registry 不等价`)
    }
    const catalog = DOCUMENT_LOCALE_CATALOGS[locale]
    for (const templateId of DOCUMENT_TEMPLATE_IDS) {
      const expectedKeys = [...DOCUMENT_PRESENTATION_REGISTRY.templates[templateId].sections].sort()
      const baselineKeys = Object.keys(baseline[templateId]).sort()
      if (JSON.stringify(baselineKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(`registry template '${templateId}' sections 与默认 catalog 不等价`)
      }
      const observedKeys = Object.keys(catalog[templateId]).sort()
      if (JSON.stringify(observedKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(`locale '${locale}' template '${templateId}' section key 不等价`)
      }
    }
  }
}

export function documentTemplateIdForKind(kind: string): DocumentTemplateId {
  const templateId = DOCUMENT_TEMPLATE_IDS.find(
    (candidate) => DOCUMENT_PRESENTATION_REGISTRY.templates[candidate].kind === kind,
  )
  if (templateId === undefined) throw new Error(`未知 document kind '${kind}'`)
  return templateId
}

export function documentPathForKind(kind: string, variables: DocumentPathVariables): string {
  const templateId = documentTemplateIdForKind(kind)
  const definition = DOCUMENT_PRESENTATION_REGISTRY.templates[templateId]
  const values: Readonly<Record<string, string | undefined>> = {
    change: variables.change,
    capability: variables.capability,
  }
  const output = definition.path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_token, key: string) => {
    const value = values[key]
    if (value === undefined || value === '') {
      throw new Error(`document kind '${kind}' 路径缺少 '${key}'`)
    }
    return value
  })
  if (/[{}]/.test(output)) throw new Error(`document kind '${kind}' 路径含未解析占位符`)
  return output
}

function workflowStepLabel(
  step: WorkflowStepPresentation,
  locale: DocumentLocale,
  stepLabelSource: DocumentTemplateVariables['workflowStepLabelSource'],
): string {
  const explicit = step.label?.trim()
  if (stepLabelSource === 'workflow-defined') return explicit || step.id
  const labels: Readonly<Record<string, string>> = DOCUMENT_WORKFLOW_STEP_LABELS[locale]
  return labels[step.id] ?? explicit ?? step.id
}

function renderLayoutInstruction(
  instruction: string,
  catalog: Readonly<Record<string, string>>,
  locale: DocumentLocale,
  variables: DocumentTemplateVariables,
): readonly string[] {
  const pending = locale === 'zh-CN' ? '待填写' : 'Pending'
  if (instruction === 'frontmatter') {
    return [
      '---',
      `change: ${variables.change}`,
      ...(variables.designDoc ? [`design-doc: ${variables.designDoc}`] : []),
      `locale: ${locale}`,
      '---',
    ]
  }
  if (instruction === 'task-pending') return [`- [ ] ${pending}`]
  if (instruction === 'scenario-pending') {
    return [`- **WHEN** ${pending}`, `- **THEN** ${pending}`]
  }

  const separator = instruction.indexOf(':')
  if (separator === -1) {
    throw new Error(`Document Presentation Registry layout 指令无效: '${instruction}'`)
  }
  const operation = instruction.slice(0, separator)
  const key = instruction.slice(separator + 1)
  const value = section(catalog, key)
  if (operation === 'workflow-steps') {
    const steps = variables.workflowSteps
      ?? DOCUMENT_WORKFLOW_STEP_IDS.map((id) => ({ id }))
    return steps.flatMap((step, index) => [
      `## ${workflowStepLabel(step, locale, variables.workflowStepLabelSource)}`,
      '',
      `- [ ] ${index === 0 ? value : `${value} (${step.id})`}`,
      ...(index === steps.length - 1 ? [] : ['']),
    ])
  }
  const heading = /^h([1-4])(-pending)?$/u.exec(operation)
  if (heading) {
    const level = Number(heading[1])
    return [`${'#'.repeat(level)} ${value}${heading[2] ? `: ${pending}` : ''}`]
  }
  if (operation === 'quote') return [`> ${value}`]
  if (operation === 'text') return [value]
  if (operation === 'prompt-placeholder') {
    return [`> ${locale === 'zh-CN' ? '[待填写]' : '[pending]'} ${value}`]
  }
  throw new Error(`Document Presentation Registry layout operation 未知: '${operation}'`)
}

export function renderDocumentTemplate(
  templateId: DocumentTemplateId,
  locale: DocumentLocale,
  variables: DocumentTemplateVariables,
): string {
  if (!(DOCUMENT_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    throw new Error(`未知 document template '${templateId}'`)
  }
  if (!isLocale(locale)) throw new Error(`不支持 document locale '${locale}'`)
  const catalog = DOCUMENT_LOCALE_CATALOGS[locale][templateId]
  const layout = DOCUMENT_PRESENTATION_REGISTRY.templates[templateId].layout
  const output = layout.flatMap((instruction) => [
    ...renderLayoutInstruction(instruction, catalog, locale, variables),
    '',
  ]).join('\n')
  return output.endsWith('\n') ? output : `${output}\n`
}
