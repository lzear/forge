import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkLocal, checkRepo, type RepoReport } from './index.ts'

vi.mock('./index.ts', () => ({ checkLocal: vi.fn(), checkRepo: vi.fn() }))

// ── helpers ──────────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`)
  }
}

const report = (...passes: boolean[]): RepoReport => ({
  repo: 'lzear/x',
  results: passes.map((pass, index) => ({
    id: `c${index}`,
    desc: `check ${index}`,
    pass,
  })),
})

// runs the bin with the given args, resolving to its exit code
const run = async (...arguments_: string[]): Promise<number | undefined> => {
  process.argv = ['node', 'repo-lint', ...arguments_]
  vi.resetModules()
  try {
    await import('./bin.ts')
    return undefined
  } catch (error) {
    if (error instanceof ExitError) return error.code
    throw error
  }
}

const logged: string[] = []
const capture = (line: unknown): void => {
  logged.push(String(line))
}
const output = (): string => logged.join('\n')

const { argv } = process

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitError(code as number | undefined)
  })
  logged.length = 0
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
})

afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('repo-lint bin', () => {
  it('prints usage without --local or --repos', async () => {
    expect(await run()).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    )
  })

  describe('--local', () => {
    it('exits 0 when every check passes', async () => {
      vi.mocked(checkLocal).mockResolvedValue(report(true, true))
      expect(await run('--local', '--skip-remote')).toBe(0)
      expect(checkLocal).toHaveBeenCalledWith({ skipRemote: true })
      expect(output()).toContain('2/2 checks passed')
    })

    it('exits 1 when a check fails', async () => {
      vi.mocked(checkLocal).mockResolvedValue(report(true, false))
      expect(await run('--local')).toBe(1)
      expect(output()).toContain('✗ check 1')
      expect(output()).toContain('1/2 checks passed')
    })
  })

  describe('--repos', () => {
    let dir: string
    beforeEach(() => {
      const temporary = mkdtempSync(path.join(tmpdir(), 'bin-test-'))
      dir = path.join(temporary, 'cache')
    })

    it('checks each repo in a created cache dir', async () => {
      vi.mocked(checkRepo).mockResolvedValue(report(true))
      expect(await run('--repos', 'lzear/a, lzear/b', '--dir', dir)).toBe(0)
      expect(existsSync(dir)).toBe(true)
      expect(checkRepo).toHaveBeenCalledWith('lzear/b', {
        baseDir: dir,
        skipRemote: false,
      })
    })

    it('passes the token through', async () => {
      vi.mocked(checkRepo).mockResolvedValue(report(true))
      await run('--repos', 'lzear/a', '--dir', dir, '--token', 't')
      expect(checkRepo).toHaveBeenCalledWith('lzear/a', {
        token: 't',
        baseDir: dir,
        skipRemote: false,
      })
    })

    it('exits 1 on a failing check or a failed clone', async () => {
      vi.mocked(checkRepo)
        .mockResolvedValueOnce(report(false))
        .mockRejectedValueOnce(new Error('clone'))
      expect(await run('--repos', 'lzear/a,lzear/b', '--dir', dir)).toBe(1)
      expect(output()).toContain('✗ could not clone repo')
    })
  })
})
