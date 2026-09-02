import { useEffect, useMemo, useState } from 'react'
import { fetchDefinitionCatalog, subscribeDefinitionCatalog, type DefinitionCatalog } from '../api/client'

export function useDefinitionCatalogSelection(
  root: string,
  selectedTrack: string,
  selectedWorkflow: string,
): {
  definitionCatalog: DefinitionCatalog | null
  pipelines: DefinitionCatalog['pipelines']
  selectedPipeline: string
  setSelectedPipeline: (value: string) => void
} {
  const [definitionCatalog, setDefinitionCatalog] = useState<DefinitionCatalog | null>(null)
  const [selectedPipeline, setSelectedPipeline] = useState('')
  useEffect(() => {
    let active = true
    setDefinitionCatalog(null)
    setSelectedPipeline('')
    void fetchDefinitionCatalog(root).then((catalog) => {
      if (active) setDefinitionCatalog(catalog)
    }).catch(() => {
      if (active) setDefinitionCatalog(null)
    })
    const stop = subscribeDefinitionCatalog(root, (catalog) => {
      if (active) setDefinitionCatalog(catalog)
    })
    return () => { active = false; stop() }
  }, [root])
  const pipelines = useMemo(
    () => definitionCatalog?.pipelines.filter((pipeline) => pipeline.workflow_id === selectedWorkflow && pipeline.track_id === selectedTrack) ?? [],
    [definitionCatalog, selectedTrack, selectedWorkflow],
  )
  useEffect(() => {
    const preferred = pipelines[0]?.id ?? ''
    setSelectedPipeline((current) => pipelines.some((pipeline) => pipeline.id === current) ? current : preferred)
  }, [pipelines])
  return { definitionCatalog, pipelines, selectedPipeline, setSelectedPipeline }
}
