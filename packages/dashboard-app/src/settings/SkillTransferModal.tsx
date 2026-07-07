import { useEffect, useState } from 'react'

export interface SkillTransferModalProps {
  selected: string[]
  onSave: (skills: string[]) => Promise<void> | void
  onCancel: () => void
}

const DND_MIME = 'application/x-pipeline-skill'

export function SkillTransferModal({ selected, onSave, onCancel }: SkillTransferModalProps): JSX.Element {
  const [all, setAll] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>(selected)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<{ skills: string[] }>)
      .then((body) => setAll(body.skills))
      .catch(() => setError('Failed to load skills'))
  }, [])

  const available = all.filter((s) => !chosen.includes(s) && s.toLowerCase().includes(query.toLowerCase()))

  function onDropToChosen(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    if (skill && !chosen.includes(skill)) setChosen([...chosen, skill])
  }
  function onDropToAvailable(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    setChosen(chosen.filter((s) => s !== skill))
  }

  return (
    <div className="modal" role="dialog">
      <input placeholder="搜索…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="split">
        <div data-testid="skill-available" onDragOver={(e) => e.preventDefault()} onDrop={onDropToAvailable}>
          {error && <div data-testid="skill-error" style={{ color: 'red' }}>{error}</div>}
          {!error && available.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
        <div data-testid="skill-chosen" onDragOver={(e) => e.preventDefault()} onDrop={onDropToChosen}>
          {chosen.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => onSave(chosen)}>保存</button>
      <button onClick={onCancel}>取消</button>
    </div>
  )
}
