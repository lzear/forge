import * as childProcess from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run as ncuRun } from 'npm-check-updates'
import { publint } from 'publint'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CheckDetail, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.js'

vi.mock('publint', () => ({ publint: vi.fn() }))
vi.mock('npm-check-updates', () => ({ run: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:child_process')>()
  return {
    ...mod,
    spawnSync: vi.fn((...args: Parameters<typeof mod.spawnSync>) =>
      mod.spawnSync(...args),
    ),
  }
})

// ── helpers ──────────────────────────────────────────────────────────────────

const tmpDir = (): string => mkdtempSync(path.join(tmpdir(), 'repo-lint-test-'))

const write = (dir: string, file: string, content = ''): void => {
  const full = path.join(dir, file)
  mkdirSync(path.join(dir, file, '..'), { recursive: true })
  writeFileSync(full, content)
}

const mockSpawn = (status: number, stdout = ''): void => {
  vi.mocked(childProcess.spawnSync).mockReturnValue({
    status,
    stdout,
    stderr: '',
    pid: 0,
    output: [],
    signal: null,
  })
}

const check = async (
  id: string,
  dir: string,
): Promise<boolean | CheckDetail> => {
  const c = LOCAL_CHECKS.find((c) => c.id === id)
  if (!c) throw new Error(`unknown check: ${id}`)
  return c.check(dir)
}

// ── LOCAL_CHECKS ─────────────────────────────────────────────────────────────

describe('LOCAL_CHECKS', () => {
  let dir: string
  beforeEach(() => {
    dir = tmpDir()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('readme-exists', () => {
    it('fails when missing', async () => {
      expect(await check('readme-exists', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, 'README.md')
      expect(await check('readme-exists', dir)).toBe(true)
    })
  })

  describe('readme-codacy-grade-badge', () => {
    it('fails when missing', async () => {
      write(dir, 'README.md', '# hi')
      expect(await check('readme-codacy-grade-badge', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(
        dir,
        'README.md',
        '![Grade](https://app.codacy.com/project/badge/Grade/abc)',
      )
      expect(await check('readme-codacy-grade-badge', dir)).toBe(true)
    })
  })

  describe('readme-codacy-coverage-badge', () => {
    it('fails when missing', async () => {
      write(dir, 'README.md', '# hi')
      expect(await check('readme-codacy-coverage-badge', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(
        dir,
        'README.md',
        '![Coverage](https://app.codacy.com/project/badge/Coverage/abc)',
      )
      expect(await check('readme-codacy-coverage-badge', dir)).toBe(true)
    })
  })

  describe('readme-npm-badge', () => {
    it('fails when missing', async () => {
      write(dir, 'README.md', '# hi')
      expect(await check('readme-npm-badge', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, 'README.md', '[![npm](https://img.shields.io/npm/v/my-pkg)]')
      expect(await check('readme-npm-badge', dir)).toBe(true)
    })
  })

  describe('editorconfig', () => {
    it('fails when missing', async () => {
      expect(await check('editorconfig', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, '.editorconfig', 'root = true')
      expect(await check('editorconfig', dir)).toBe(true)
    })
  })

  describe('codacy-config', () => {
    it('fails when missing', async () => {
      expect(await check('codacy-config', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, '.codacy.yml', 'engines:')
      expect(await check('codacy-config', dir)).toBe(true)
    })
  })

  describe('license', () => {
    it('fails when missing', async () => {
      expect(await check('license', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, 'LICENSE', 'MIT')
      expect(await check('license', dir)).toBe(true)
    })
  })

  describe('ci-workflow', () => {
    it('fails when missing', async () => {
      expect(await check('ci-workflow', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, '.github/workflows/ci.yml', 'on: push')
      expect(await check('ci-workflow', dir)).toBe(true)
    })
  })

  describe('renovate', () => {
    it('fails when missing', async () => {
      expect(await check('renovate', dir)).toBe(false)
    })
    it('passes when present', async () => {
      write(dir, 'renovate.json', '{}')
      expect(await check('renovate', dir)).toBe(true)
    })
  })

  describe('pkg-publint', () => {
    it('passes when no package.json', async () => {
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: true })
    })
    it('passes when private with no workspaces', async () => {
      write(dir, 'package.json', JSON.stringify({ private: true }))
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: true })
    })
    it('passes when publint returns no errors', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({ messages: [] } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: true })
    })
    it('fails when publint returns errors', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({
        messages: [{ type: 'error', code: 'FILE_INVALID_FORMAT' }],
      } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: false })
    })
    it('passes when monorepo and all packages pass', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(dir, 'packages/a/package.json', JSON.stringify({}))
      write(dir, 'packages/b/package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({ messages: [] } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: true })
    })
    it('fails when monorepo and a package fails', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(dir, 'packages/a/package.json', JSON.stringify({}))
      write(dir, 'packages/b/package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({
        messages: [{ type: 'error', code: 'FILE_INVALID_FORMAT' }],
      } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: false })
    })
    it('skips private workspace packages', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(dir, 'packages/a/package.json', JSON.stringify({}))
      write(dir, 'packages/b/package.json', JSON.stringify({ private: true }))
      vi.mocked(publint).mockResolvedValue({ messages: [] } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: true })
    })
  })

  describe('pkg-attw', () => {
    it('passes when no package.json', async () => {
      expect(await check('pkg-attw', dir)).toMatchObject({ pass: true })
    })
    it('passes when private with no workspaces', async () => {
      write(dir, 'package.json', JSON.stringify({ private: true }))
      expect(await check('pkg-attw', dir)).toMatchObject({ pass: true })
    })
    it('passes when attw exits 0', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      mockSpawn(0)
      expect(await check('pkg-attw', dir)).toMatchObject({ pass: true })
    })
    it('fails when attw exits 1', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      mockSpawn(1)
      expect(await check('pkg-attw', dir)).toMatchObject({ pass: false })
    })
    it('fails when monorepo and a workspace package fails', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(dir, 'packages/a/package.json', JSON.stringify({}))
      write(dir, 'packages/b/package.json', JSON.stringify({}))
      mockSpawn(1)
      expect(await check('pkg-attw', dir)).toMatchObject({ pass: false })
    })
  })

  describe('pkg-knip', () => {
    it('passes when knip exits 0', async () => {
      mockSpawn(0)
      expect(await check('pkg-knip', dir)).toMatchObject({ pass: true })
    })
    it('fails when knip exits 1', async () => {
      mockSpawn(1, 'Unused exports\nsrc/foo.ts: bar')
      const result = await check('pkg-knip', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('Unused')
      expect((result as { detail: string }).detail).toContain('npx knip')
    })
  })

  describe('deps-fresh', () => {
    it('passes when ncu returns no upgrades', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      vi.mocked(ncuRun).mockResolvedValue({})
      expect(await check('deps-fresh', dir)).toBe(true)
    })
    it('fails with detail when upgrades available', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      vi.mocked(ncuRun).mockResolvedValue({ react: '^18.0.0' })
      const result = await check('deps-fresh', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('react')
    })
    it('uses workspaces mode for monorepos', async () => {
      write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
      vi.mocked(ncuRun).mockResolvedValue({})
      await check('deps-fresh', dir)
      expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
        expect.objectContaining({ workspaces: true }),
      )
    })
  })
})

// ── REMOTE_CHECKS ─────────────────────────────────────────────────────────────

const remoteCheck = (id: string, repo: string): boolean => {
  const c = REMOTE_CHECKS.find((c) => c.id === id)
  if (!c) throw new Error(`unknown check: ${id}`)
  return c.check(repo)
}

const mockSecrets = (names: string[]): void => {
  vi.mocked(childProcess.spawnSync).mockReturnValue({
    status: 0,
    stdout: JSON.stringify(names.map((name) => ({ name }))),
    stderr: '',
    pid: 0,
    output: [],
    signal: null,
  })
}

describe('REMOTE_CHECKS', () => {
  afterEach(() => vi.clearAllMocks())

  describe('secret-npm-token', () => {
    it('fails when gh errors', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      })
      expect(remoteCheck('secret-npm-token', 'lzear/repo')).toBe(false)
    })
    it('fails when secret absent', () => {
      mockSecrets(['OTHER_TOKEN'])
      expect(remoteCheck('secret-npm-token', 'lzear/repo')).toBe(false)
    })
    it('passes when secret present', () => {
      mockSecrets(['NPM_TOKEN'])
      expect(remoteCheck('secret-npm-token', 'lzear/repo')).toBe(true)
    })
  })

  describe('secret-codacy-token', () => {
    it('passes when secret present', () => {
      mockSecrets(['CODACY_PROJECT_TOKEN'])
      expect(remoteCheck('secret-codacy-token', 'lzear/repo')).toBe(true)
    })
    it('fails when secret absent', () => {
      mockSecrets(['NPM_TOKEN'])
      expect(remoteCheck('secret-codacy-token', 'lzear/repo')).toBe(false)
    })
  })
})
