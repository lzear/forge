import { afterEach, describe, expect, it, vi } from 'vitest'

// vitest itself may run under an agent: pin it per test
const environment = vi.hoisted(() => ({ isAgent: false }))
vi.mock('std-env', () => environment)

const reporters = async (entry: './vitest.ts' | './vitest.react.ts') => {
  vi.resetModules()
  const { default: config } = await import(entry)
  return config.test?.coverage?.reporter
}

describe('vitest config', () => {
  afterEach(() => {
    environment.isAgent = false
  })

  it('prints the full coverage table by default', async () => {
    expect(await reporters('./vitest.ts')).toEqual(['json', 'lcov', 'text'])
  })

  it('prints a coverage summary under an agent', async () => {
    environment.isAgent = true
    expect(await reporters('./vitest.ts')).toEqual([
      'json',
      'lcov',
      'text-summary',
    ])
  })

  it('react inherits the reporters', async () => {
    environment.isAgent = true
    expect(await reporters('./vitest.react.ts')).toEqual([
      'json',
      'lcov',
      'text-summary',
    ])
  })
})
