export class CliExit extends Error {
  constructor(public readonly code: number) {
    super(`exit ${code}`)
  }
}

export function bail(code: number): void {
  if (code !== 0) throw new CliExit(code)
}

export const stripNl = (value: string): string => value.replace(/\n$/, '')
