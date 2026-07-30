import { useRef, useState } from 'react'

export interface MandatoryCellMutation {
  token: symbol
  root: string
  cellKey: string
  revision: string
}

function operationKey(root: string, cellKey: string): string {
  return JSON.stringify([root, cellKey])
}

export function useMandatoryCellMutations(): {
  begin: (root: string, cellKey: string, revision: string) => MandatoryCellMutation | null
  busy: (root: string, cellKey: string) => boolean
  isLatest: (operation: MandatoryCellMutation) => boolean
  finish: (operation: MandatoryCellMutation) => void
} {
  const operations = useRef(new Map<string, MandatoryCellMutation>())
  const [, render] = useState(0)

  function isLatest(operation: MandatoryCellMutation): boolean {
    return operations.current.get(operationKey(operation.root, operation.cellKey))?.token === operation.token
  }

  return {
    begin(root, cellKey, revision) {
      const key = operationKey(root, cellKey)
      if (operations.current.has(key)) return null
      const operation = { token: Symbol(cellKey), root, cellKey, revision }
      operations.current.set(key, operation)
      render((value) => value + 1)
      return operation
    },
    busy(root, cellKey) {
      return operations.current.has(operationKey(root, cellKey))
    },
    isLatest,
    finish(operation) {
      if (!isLatest(operation)) return
      operations.current.delete(operationKey(operation.root, operation.cellKey))
      render((value) => value + 1)
    },
  }
}
