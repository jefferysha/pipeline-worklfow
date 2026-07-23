/**
 * DO NOT EDIT —— 生成文件。
 * 由 tools/generate-default-workflow.mjs 从 templates/workflows/default.yaml 生成。
 * 重新生成：npm run generate:default-workflow
 * 来源：templates/workflows/default.yaml
 *
 * 含稳定排序的 default step 元数据与 artifact declaration 纯数据；track predicate 过滤与查询在
 * 手写层 default-artifacts.ts / todo-projection.ts。改 default.yaml 后须重跑生成（CI freshness
 * 门禁逐字节校验）。
 */
import type { DefaultArtifactDeclaration } from './default-artifacts.js'

export const DEFAULT_WORKFLOW_STEPS = [
  { id: "open", label: "立项" },
  { id: "explore", label: "调研" },
  { id: "spec", label: "规格" },
  { id: "build", label: "实现" },
  { id: "verify", label: "验证" },
  { id: "ship", label: "交付" },
  { id: "archive", label: "归档" },
] as const

export const DEFAULT_ARTIFACT_DECLARATIONS = {
  explore: [
    {
      kind: 'file',
      field: 'design_doc',
      type: 'file_path',
      producerPolicy: 'effective-phase-skills',
    },
  ],
  spec: [
    {
      kind: 'file',
      field: 'plan',
      type: 'file_path',
      producerPolicy: 'effective-phase-skills',
      requiredWhen: {
        kind: 'track-not-in',
        values: ['pm'],
      },
    },
  ],
  verify: [
    {
      kind: 'file',
      field: 'verification_report',
      type: 'file_path',
      producerPolicy: 'effective-phase-skills',
    },
  ],
} as const satisfies Readonly<Record<string, readonly DefaultArtifactDeclaration[]>>
