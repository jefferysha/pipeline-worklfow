import type { DefinitionCatalogPipeline } from '../api/definitionCatalogTypes'

interface PipelineSelectorProps {
  pipelines: DefinitionCatalogPipeline[]
  selectedPipeline: string
  onChange: (value: string) => void
  label: string
  stageSummary: (count: number) => string
}
export function PipelineSelector({ pipelines, selectedPipeline, onChange, label, stageSummary }: PipelineSelectorProps): JSX.Element | null {
  if (pipelines.length === 0) return null
  const selected = pipelines.find((pipeline) => pipeline.id === selectedPipeline)
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wider text-text-3" data-testid="change-pipeline-label">
      {label}
      <select className="w-full rounded-lg border border-border bg-bg px-3 py-2 mt-1.5 font-mono text-xs text-text outline-none focus:border-(--accent) focus:ring-2 focus:ring-accent-t" data-testid="change-pipeline" value={selectedPipeline} onChange={(event) => onChange(event.target.value)}>
        {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.id}</option>)}
      </select>
      <span className="mt-1.5 block normal-case tracking-normal text-text-3">{stageSummary(selected?.stages.length ?? 0)}</span>
    </label>
  )
}
