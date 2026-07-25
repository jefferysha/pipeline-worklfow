import type { WbSkillRef } from './WorkbenchView'

export const SKILL_ID_RE = /^[a-zA-Z0-9_-]+$/
export const NOTE_CLS = 'text-xs leading-[1.55] text-text-3'
export const ERR_CLS = 'p-5 text-[13px] text-red'
export const SEC_H_CLS = 'mb-2.5 flex items-center gap-1.5 text-[13px] font-bold'
export const HINT_CLS = 'text-xs font-normal text-text-3'
export const EMPTY_CLS = 'text-[12.5px] text-text-3'
export const CHIP_CLS =
  'inline-flex h-6 items-center gap-1 rounded-[7px] border border-border bg-fill px-[9px] font-mono text-xs text-text-2 data-uninstalled:opacity-62'
export const CHIP_BADGE_CLS =
  'ml-1 flex-none whitespace-nowrap rounded-full border-0 bg-[color-mix(in_oklch,var(--red)_52%,var(--green))] px-1.5 py-px text-[10px] font-bold text-card'
export const ADDCHIP_CLS =
  'h-6 cursor-pointer rounded-[7px] border border-dashed border-border-2 bg-transparent px-[9px] text-xs font-semibold text-text-3 transition-colors hover:bg-fill hover:text-text-2'
export const ACTIONS_CLS = 'flex items-center gap-2 pt-[9px]'
export const CHAIN_CLS = 'flex flex-wrap items-center gap-1.5 py-[7px]'
export const CHAIN_K_CLS = 'mr-1 flex-none text-[11px] font-bold tracking-[.04em] text-text-3'

export const skConn = (
  <span
    aria-hidden="true"
    data-anim="skconn"
    className="relative mx-0.5 inline-block h-3.5 w-[26px] flex-none before:absolute before:left-0.5 before:right-[7px] before:top-1.5 before:h-0.5 before:animate-[wb-flowsk_1.6s_linear_infinite] before:bg-[repeating-linear-gradient(90deg,var(--purple)_0_5px,transparent_5px_10px)] before:content-[''] after:absolute after:right-px after:top-[3px] after:h-2 after:w-[5px] after:bg-purple after:content-[''] after:[clip-path:polygon(0_0,100%_50%,0_100%)] motion-reduce:before:animate-none"
  />
)

export async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null) {
      const error = Reflect.get(body, 'error')
      if (typeof error === 'string') return error
    }
  } catch {
    return ''
  }
  return ''
}

export interface ChainRow {
  ghost: string | null
  ids: string[]
}

export interface ChainProjection {
  chains: ChainRow[]
  solos: string[]
}

export function buildChains(skills: readonly WbSkillRef[]): ChainProjection {
  const byId = new Set(skills.map((skill) => skill.id))
  const kids = new Map<string, string[]>()
  for (const skill of skills) {
    for (const dependency of (skill.depends_on ?? []).filter((id) => byId.has(id))) {
      kids.set(dependency, [...(kids.get(dependency) ?? []), skill.id])
    }
  }
  const used = new Set<string>()
  function walk(start: string): string[] {
    const chain = [start]
    used.add(start)
    let current = start
    for (;;) {
      const next = (kids.get(current) ?? []).find((id) => !used.has(id))
      if (!next) return chain
      chain.push(next)
      used.add(next)
      current = next
    }
  }
  const chains: ChainRow[] = []
  const solos: string[] = []
  for (const skill of skills) {
    if (used.has(skill.id) || (skill.depends_on ?? []).length > 0) continue
    const chain = walk(skill.id)
    if (chain.length === 1) solos.push(skill.id)
    else chains.push({ ghost: null, ids: chain })
  }
  for (const skill of skills) {
    if (!used.has(skill.id)) chains.push({ ghost: skill.depends_on?.[0] ?? null, ids: walk(skill.id) })
  }
  return { chains, solos }
}
