/** Stable fail-loud error surface for the narrow tracks.yaml codec. */
export class TrackConfigParseError extends Error {
  readonly line: number | null

  constructor(line: number | null, detail: string) {
    super(line === null ? `tracks.yaml: ${detail}` : `tracks.yaml:${line}: ${detail}`)
    this.name = 'TrackConfigParseError'
    this.line = line
  }
}
