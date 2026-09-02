import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { PipelineSelector } from './PipelineSelector'
import type { DefinitionCatalogPipeline } from '../api/definitionCatalogTypes'

const pipeline: DefinitionCatalogPipeline = {
  id: 'custom:frontend:main',
  version: 'v1',
  fingerprint: 'pipeline-fingerprint',
  source: 'project',
  workflow_id: 'custom',
  track_id: 'frontend',
  stage_order: ['shape', 'build'],
  stages: [
    {
      id: 'shape', label: 'Shape', order: 0, mode: 'parallel', skill_ids: ['research', 'design'],
      skill_dependencies: { research: [], design: [] }, depends_on: [], gate: 'review',
    },
    {
      id: 'build', label: 'Build', order: 1, mode: 'serial', skill_ids: ['implement'],
      skill_dependencies: { implement: ['research'] }, depends_on: ['shape'], gate: null,
    },
  ],
}

describe('PipelineSelector', () => {
  it('shows the frozen stage order, execution mode, skills and dependencies before creation', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    render(
      <I18nProvider>
        <PipelineSelector
          pipelines={[pipeline]}
          selectedPipeline={pipeline.id}
          onChange={vi.fn()}
          label="Pipeline"
          stageSummary={(count) => `${count} stages`}
        />
      </I18nProvider>,
    )

    const stages = screen.getByTestId('change-pipeline-stages')
    expect(stages).toHaveTextContent('Shape')
    expect(stages).toHaveTextContent('Parallel')
    expect(stages).toHaveTextContent('research → design')
    expect(stages).toHaveTextContent('Build')
    expect(stages).toHaveTextContent('Serial')
    expect(stages).toHaveTextContent('implement')
    expect(stages).toHaveTextContent('Dependencies: implement ← research')
  })
})
