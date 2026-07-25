/** Narrow an indexed or optional value after its surrounding invariant has been established. */
export function required<T>(value: T | undefined, message = 'required value is missing'): T {
  if (value === undefined) throw new Error(message)
  return value
}
