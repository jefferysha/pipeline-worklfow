/** Serialize an async poll body; skipped overlapping calls never mutate the current run's state. */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let running = false
  return async () => {
    if (running) return
    running = true
    try {
      await task()
    } finally {
      running = false
    }
  }
}
