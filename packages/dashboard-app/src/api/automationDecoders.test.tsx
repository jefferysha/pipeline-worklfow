import { describe, expect, it } from 'vitest'
import { decodeNormalizedAutomationSettings } from './automationDecoders'

const normalized = {
  enabled: false,
  max_parallel: 4,
  max_retries: 1,
  default_opt_in: false,
  image: '',
}

describe('decodeNormalizedAutomationSettings', () => {
  it('accepts the exact normalized server contract including its boundary values', () => {
    expect(decodeNormalizedAutomationSettings(normalized)).toEqual(normalized)
    expect(decodeNormalizedAutomationSettings({
      enabled: true,
      max_parallel: 8,
      max_retries: 0,
      default_opt_in: true,
      image: 'ghcr.io/tenon/sandcastle@sha256:abc-123_DEF',
    })).not.toBeNull()
  })

  it.each([
    { ...normalized, enabled: undefined },
    { ...normalized, max_parallel: 0 },
    { ...normalized, max_parallel: 9 },
    { ...normalized, max_parallel: 1.5 },
    { ...normalized, max_retries: -1 },
    { ...normalized, max_retries: 4 },
    { ...normalized, max_retries: 0.5 },
    { ...normalized, default_opt_in: 1 },
    { ...normalized, image: ' sandcastle:local ' },
    { ...normalized, image: 'has space' },
    { ...normalized, image: 'x'.repeat(201) },
    { ...normalized, unexpected: true },
  ])('rejects a non-normalized or non-exact settings object', (value) => {
    expect(decodeNormalizedAutomationSettings(value)).toBeNull()
  })
})
