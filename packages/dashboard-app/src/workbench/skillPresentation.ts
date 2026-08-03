import type { WbSkillEntry } from '../api/client'

const PURPOSES: Record<string, { name: string; description: string }> = {
  research: { name: '调研与资料分析', description: '收集背景、约束与可验证依据。' },
  implement: { name: '实现与改造', description: '按照阶段目标完成代码或配置变更。' },
  verify: { name: '验证与证据', description: '运行检查并整理可复核的交付证据。' },
  'browser-qa': { name: '浏览器验收', description: '在真实浏览器中检查流程、交互与视觉结果。' },
  'code-review': { name: '代码审查', description: '按项目规范和需求目标检查当前代码变更。' },
  'code-tour': { name: '代码导览', description: '把关键代码路径整理成可跟随的分步导览。' },
  'commit-commands:commit': { name: '提交变更', description: '检查改动后创建清晰、可追溯的 Git 提交。' },
  'commit-commands:commit-push-pr': { name: '提交并发起评审', description: '提交代码、推送分支并创建可评审的合并请求。' },
  'deep-research': { name: '深度资料研究', description: '从多来源交叉核对信息并形成有依据的结论。' },
  'deployment-patterns': { name: '部署方案设计', description: '规划可重复、可回滚的构建与部署流程。' },
  'docker-patterns': { name: '容器方案设计', description: '用可靠的镜像、网络与存储模式组织容器运行。' },
  'find-skills': { name: '查找可用技能', description: '从已安装能力中找到最适合当前任务的 Skill。' },
  'test-runner': { name: '自动化测试', description: '运行与本阶段相关的测试并报告真实结果。' },
  'evidence-reviewer': { name: '证据复核', description: '核对测试、产物与结论是否一致。' },
  outline: { name: '任务结构化', description: '把目标拆成清晰、可执行的工作步骤。' },
  brainstorming: { name: '方案发散与收敛', description: '先拓展候选方案，再收敛到可执行方向。' },
  'superpowers:brainstorming': { name: '方案发散与收敛', description: '先拓展候选方案，再收敛到可执行方向。' },
  'grill-with-docs': { name: '文档审问与方案打磨', description: '对照资料追问缺口，消除模糊和自相矛盾。' },
  'opsx:explore': { name: '需求探索与边界确认', description: '梳理现状、用户目标、约束与待验证假设。' },
  'openspec-explore': { name: '需求探索与边界确认', description: '梳理现状、用户目标、约束与待验证假设。' },
  'improve-codebase-architecture': { name: '代码架构体检', description: '识别模块边界、依赖关系与长期维护风险。' },
  'superpowers:writing-plans': { name: '实施计划编排', description: '把目标拆成有顺序、有验证点的实施计划。' },
  'writing-plans': { name: '实施计划编排', description: '把目标拆成有顺序、有验证点的实施计划。' },
  'superpowers:test-driven-development': { name: '测试驱动实现', description: '先用失败测试锁定行为，再完成实现并回归。' },
  'test-driven-development': { name: '测试驱动实现', description: '先用失败测试锁定行为，再完成实现并回归。' },
  'web-design-guidelines': { name: 'Web 界面规范审查', description: '检查可用性、可访问性、响应式与界面一致性。' },
  'superpowers:verification-before-completion': { name: '完成前证据复核', description: '交付前用真实命令与产物复核所有完成声明。' },
  'verification-before-completion': { name: '完成前证据复核', description: '交付前用真实命令与产物复核所有完成声明。' },
  'e2e-testing': { name: '端到端流程验收', description: '从用户入口到真实结果验证完整业务动线。' },
  'verification-loop': { name: '持续验证闭环', description: '反复执行验证、定位缺口并收敛到可交付状态。' },
  'taste-skill': { name: '界面品质把关', description: '检查视觉层级、信息密度与交互细节。' },
  'design-taste-frontend': { name: '界面品质把关', description: '检查视觉层级、信息密度与交互细节。' },
  handoff: { name: '交接与上下文整理', description: '整理已完成事项、证据与后续接手信息。' },
  'to-tickets': { name: '拆分交付任务', description: '把方案拆成可以独立领取和验收的任务。' },
  'to-issues': { name: '拆分交付任务', description: '把方案拆成可以独立领取和验收的任务。' },
  prototype: { name: '快速原型验证', description: '用可交互原型验证关键设计问题。' },
  'frontend-patterns': { name: '前端工程模式', description: '用成熟的 React 与前端工程约束指导实现。' },
  'github-ops': { name: 'GitHub 协作与仓库操作', description: '处理分支、提交、PR、检查与仓库协作。' },
  'huashu-design': { name: '高保真设计表达', description: '把产品意图制作成可评审的高保真界面或演示。' },
  hue: { name: '设计语言生成', description: '根据产品气质生成可复用的视觉语言与设计规则。' },
  'learn-record': { name: '经验沉淀', description: '把本轮可复用的经验整理为后续可检索记录。' },
  'market-research': { name: '市场研究', description: '分析市场、竞品与用户信号，形成有依据的判断。' },
  'nestjs-patterns': { name: 'NestJS 工程模式', description: '用清晰的模块、控制器与服务边界组织后端实现。' },
  'frontend-design': { name: '前端界面设计', description: '把产品意图落实为清晰、可用的界面。' },
  hallmark: { name: '设计去模板化审查', description: '识别模板化与 AI 痕迹，提升界面辨识度。' },
  'to-spec': { name: '交付规格整理', description: '把已完成变更整理成可评审、可追踪的交付规格。' },
  'opsx:apply': { name: '应用已确认变更', description: '按已确认规格执行变更并保留过程证据。' },
  'openspec-apply-change': { name: '应用已确认变更', description: '按已确认规格执行变更并保留过程证据。' },
  'opsx:archive': { name: '归档已交付变更', description: '完成交付后归档规格、证据与变更状态。' },
  opsx: { name: 'OpenSpec 工作流入口', description: '根据当前任务选择提案、探索、实施或归档动作。' },
  pipeline: { name: 'Pipeline 工作流入口', description: '根据当前阶段选择对应的流程执行能力。' },
  'tenon-open': { name: '启动变更', description: '建立变更上下文并明确本轮目标与边界。' },
  'tenon-explore': { name: '探索方案', description: '调研现状与约束，为后续规格提供依据。' },
  'tenon-build': { name: '实施变更', description: '按照已确认规格完成代码与配置修改。' },
  'tenon-verify': { name: '验证变更', description: '运行真实检查并整理可复核的验证结论。' },
  'tenon-ship': { name: '交付变更', description: '整理交付内容并完成发布前后的必要动作。' },
  'tenon-archive': { name: '归档变更', description: '保存最终状态、证据与可追溯记录。' },
  'tenon-spec': { name: '编写规格', description: '把需求整理成可实施、可验收的明确规格。' },
  'tenon': { name: 'Tenon 操作', description: '操作当前项目的工作流、阶段与状态事实。' },
  'openspec-archive-change': { name: '归档已交付变更', description: '完成交付后归档规格、证据与变更状态。' },
  'superpowers:finishing-a-development-branch': { name: '开发分支收尾', description: '完成验证、整理分支并准备合并或交付。' },
  'finishing-a-development-branch': { name: '开发分支收尾', description: '完成验证、整理分支并准备合并或交付。' },
  'tenon-researcher': { name: '并行专题调研', description: '按专题独立收集资料并输出可合并的研究结论。' },
  'search-first': { name: '先检索再实现', description: '先查找现有能力与先例，避免重复建设。' },
  'shadcn-ui': { name: '组件化界面实现', description: '用一致的组件模式构建可访问、可维护的界面。' },
  'tailwind-css-patterns': { name: '样式工程规范', description: '用稳定的样式模式控制布局、状态与响应式行为。' },
  'react-patterns': { name: 'React 工程模式', description: '用清晰的组件与状态模式组织前端实现。' },
  'react-best-practices': { name: 'React 性能与质量审查', description: '检查渲染、数据流与性能方面的工程风险。' },
  playwright: { name: '浏览器自动化', description: '用真实浏览器执行页面交互、断言与截图验收。' },
  'postgres-patterns': { name: 'PostgreSQL 工程模式', description: '设计可靠的数据模型、查询、索引与事务边界。' },
  'python-patterns': { name: 'Python 工程模式', description: '用类型清晰、易维护的 Python 模式完成实现。' },
  'python-testing': { name: 'Python 测试', description: '用可复现测试验证 Python 行为与边界条件。' },
  run: { name: '执行任务', description: '按已确认的计划执行当前阶段任务并返回真实结果。' },
  'security-review': { name: '安全审查', description: '检查输入、权限、数据与运行边界中的安全风险。' },
  'skill-creator': { name: '创建 Skill', description: '把稳定工作方法整理成可复用、可验证的 Skill。' },
  superpowers: { name: 'Superpowers 工作流入口', description: '根据任务类型选择规划、实现、验证等配套能力。' },
  'superpowers:dispatching-parallel-agents': { name: '并行任务调度', description: '把互不依赖的工作拆分并行推进，再汇总结论。' },
  'superpowers:subagent-driven-development': { name: '分工驱动开发', description: '按边界拆分实现任务并逐项复核整合结果。' },
  triage: { name: '问题分诊', description: '对失败或待处理事项分类、排序并确定下一步。' },
  'uiuxdesign-pro': { name: 'UI/UX 设计辅助', description: '用交互与视觉原则优化页面结构和使用体验。' },
  'web-artifacts-builder': { name: 'Web 交互产物构建', description: '构建可运行、可交互的多组件 Web 产物。' },
  'zoom-out': { name: '全局视角复核', description: '退一步检查整体目标、边界与方案是否仍然一致。' },
  'opsx:propose': { name: '提案与需求澄清', description: '把想法整理成可评审、可执行的变更提案。' },
  'openspec-propose': { name: '提案与需求澄清', description: '把想法整理成可评审、可执行的变更提案。' },
}

function humanize(id: string): string {
  const base = id.split(':').at(-1) ?? id
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function skillAlternatives(token: string): string[] {
  return token.split('|').map((part) => part.trim()).filter(Boolean)
}

export function resolvedSkillId(token: string, registry: readonly WbSkillEntry[] | null | undefined): string {
  const alternatives = skillAlternatives(token)
  return alternatives.find((id) => registry?.some((entry) => entry.name === id && entry.installed)) ?? alternatives[0] ?? token
}

export function skillPresentation(token: string, registry?: readonly WbSkillEntry[] | null, lang: 'zh' | 'en' = 'zh'): {
  id: string
  name: string
  description: string
  technicalTitle: string
} {
  const id = resolvedSkillId(token, registry)
  const known = PURPOSES[id]
  const registryDescription = registry?.find((entry) => entry.name === id)?.description?.trim()
  const hasChinese = registryDescription ? /[\u3400-\u9fff]/.test(registryDescription) : false
  const description = lang === 'en'
    ? (!hasChinese && registryDescription
        ? registryDescription
        : `Runs the installed ${humanize(id)} Skill for this stage; its installed definition remains authoritative.`)
    : known?.description
      ?? (hasChinese ? registryDescription : undefined)
      ?? `用于执行“${humanize(id)}”相关工作；具体规则来自已安装 Skill。`
  return {
    id,
    // Skill 名称是运行时契约的一部分，不能为了“人话”而改名。中文用途只作为说明。
    name: id,
    description,
    technicalTitle: lang === 'en'
      ? `${humanize(id)}: ${description}${registryDescription && registryDescription !== description && !hasChinese ? ` Original description: ${registryDescription}` : ''}${token.includes('|') ? ` Resolved ${id} from compatible candidates ${token}.` : ''}`
      : `${known?.name ?? humanize(id)}：${description}${registryDescription && registryDescription !== description ? ` 原始说明：${registryDescription}` : ''}${token.includes('|') ? ` 系统已从兼容候选 ${token} 中采用 ${id}。` : ''}`,
  }
}
