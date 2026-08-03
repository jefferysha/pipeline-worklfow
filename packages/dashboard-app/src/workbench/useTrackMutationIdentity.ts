import { useEffect, useRef, useState } from 'react'

export interface TrackMutationIdentity {
  token: symbol
  root: string
  revision: string
  track: string
  kind: 'save' | 'delete'
}

function entityKey(root: string, track: string): string {
  return JSON.stringify([root, track])
}

export function useTrackMutationIdentity(root: string, editorTrack: string | null): {
  busy: boolean
  begin: (kind: 'save' | 'delete', revision: string, track: string) => TrackMutationIdentity
  isActive: (operation: TrackMutationIdentity) => boolean
  isCurrentEntity: (operation: TrackMutationIdentity) => boolean
  finish: (operation: TrackMutationIdentity) => void
} {
  const [, render] = useState(0)
  const operations = useRef(new Map<string, TrackMutationIdentity>())
  const surface = useRef({ root, track: editorTrack })
  surface.current = { root, track: editorTrack }

  useEffect(() => {
    operations.current.clear()
    render((value) => value + 1)
  }, [root])

  function isActive(operation: TrackMutationIdentity): boolean {
    return operations.current.get(entityKey(operation.root, operation.track))?.token === operation.token
  }

  return {
    busy: editorTrack !== null && operations.current.has(entityKey(root, editorTrack)),
    begin(kind, revision, track) {
      const operation = { token: Symbol(`track-${kind}:${track}`), root, revision, track, kind }
      operations.current.set(entityKey(root, track), operation)
      render((value) => value + 1)
      return operation
    },
    isActive,
    isCurrentEntity(operation) {
      return isActive(operation)
        && surface.current.root === operation.root
        && surface.current.track === operation.track
    },
    finish(operation) {
      if (!isActive(operation)) return
      operations.current.delete(entityKey(operation.root, operation.track))
      render((value) => value + 1)
    },
  }
}
