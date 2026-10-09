import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import lint from '@commitlint/lint'
import load from '@commitlint/load'
import { describe, expect, it } from 'vitest'
import config from './commitlint.ts'

// an empty dir: nothing resolvable from the consumer, as under Bun's isolated linker
const cwd = mkdtempSync(path.join(tmpdir(), 'commitlint-'))

describe('commitlint config', () => {
  const loaded = load(config, { cwd })

  const valid = async (message: string) => {
    const { rules, parserPreset } = await loaded
    const { valid } = await lint(message, rules, {
      parserOpts: parserPreset?.parserOpts as never,
    })
    return valid
  }

  it('accepts a conventional header', async () => {
    await expect(valid('feat(configs): add x')).resolves.toBe(true)
  })

  it('parses breaking changes with the preset', async () => {
    await expect(valid('feat(configs)!: drop x')).resolves.toBe(true)
  })

  it('rejects a header without a type', async () => {
    await expect(valid('add x')).resolves.toBe(false)
  })
})
