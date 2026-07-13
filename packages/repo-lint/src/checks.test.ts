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
  const module_ = await importOriginal<typeof import('node:child_process')>()
  return {
    ...module_,
    spawnSync: vi.fn((...arguments_: Parameters<typeof module_.spawnSync>) =>
      module_.spawnSync(...arguments_),
    ),
  }
})

// ── helpers ──────────────────────────────────────────────────────────────────

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

interface RegistryPackage {
  versions: Record<string, { deprecated?: string }>
  'dist-tags'?: Record<string, string>
}

const mockRegistry = (packages: Record<string, RegistryPackage>): void => {
  fetchMock.mockImplementation((url: string) => {
    const entry = Object.entries(packages).find(([name]) =>
      url.endsWith(name.replace('/', '%2F')),
    )
    if (!entry) return Promise.resolve({ ok: false, status: 404 })
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(entry[1]),
    })
  })
}

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

  describe('codacy', () => {
    it('passes when both badges and config are present', async () => {
      write(
        dir,
        'README.md',
        '![Grade](https://app.codacy.com/project/badge/Grade/abc)\n' +
          '![Coverage](https://app.codacy.com/project/badge/Coverage/abc)',
      )
      write(dir, '.codacy.yml', 'engines:')
      expect(await check('codacy', dir)).toBe(true)
    })
    it('fails listing every missing piece', async () => {
      write(
        dir,
        'README.md',
        '![Grade](https://app.codacy.com/project/badge/Grade/abc)',
      )
      const result = await check('codacy', dir)
      expect(result).toMatchObject({ pass: false })
      const { detail } = result as { detail: string }
      expect(detail).toContain('coverage badge missing')
      expect(detail).toContain('.codacy.yml missing')
      expect(detail).not.toContain('grade badge')
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

  describe('monorepo-lint', () => {
    it('skips non-monorepos', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      expect(await check('monorepo-lint', dir)).toMatchObject({ pass: true })
    })
    it('passes when sherif exits 0', async () => {
      write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
      mockSpawn(0)
      expect(await check('monorepo-lint', dir)).toBe(true)
    })
    it('fails with output when sherif finds issues', async () => {
      write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
      mockSpawn(1, 'multiple versions of eslint')
      const result = await check('monorepo-lint', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain(
        'multiple versions',
      )
    })
  })

  describe('deps-audit', () => {
    it('passes when audit exits 0', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      mockSpawn(0)
      expect(await check('deps-audit', dir)).toBe(true)
      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['audit']),
        expect.objectContaining({ cwd: dir }),
      )
    })
    it('uses the detected package manager', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ packageManager: 'yarn@4.17.1' }),
      )
      mockSpawn(0)
      await check('deps-audit', dir)
      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
        'yarn',
        expect.arrayContaining(['npm', 'audit']),
        expect.objectContaining({ cwd: dir }),
      )
    })
    it('fails with output when audit exits non-zero', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      mockSpawn(1, '3 high severity vulnerabilities')
      const result = await check('deps-audit', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('high severity')
    })
  })

  describe('deps-deprecated', () => {
    it('passes when no dependency is deprecated', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ dependencies: { alive: '^1' } }),
      )
      mockRegistry({ alive: { versions: { '1.2.0': {} } } })
      expect(await check('deps-deprecated', dir)).toBe(true)
    })

    it('fails when the resolved version is deprecated', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ devDependencies: { dead: '^2' } }),
      )
      mockRegistry({
        dead: { versions: { '2.4.0': { deprecated: 'use other-pkg' } } },
      })
      const result = await check('deps-deprecated', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain(
        'dead@2.4.0 — use other-pkg',
      )
    })

    it('prefers the latest dist-tag over junk prereleases', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ dependencies: { rc: '^19.1.0-rc.2' } }),
      )
      mockRegistry({
        rc: {
          versions: {
            '19.1.0-rc.2': {},
            '19.1.0-rc.1-junk-build': { deprecated: 'wrong version' },
          },
          'dist-tags': { latest: '19.1.0-rc.2' },
        },
      })
      expect(await check('deps-deprecated', dir)).toBe(true)
    })

    it('ignores non-registry ranges and resolves npm aliases', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({
          dependencies: {
            local: 'workspace:*',
            aliased: 'npm:real-pkg@^3',
          },
        }),
      )
      mockRegistry({ 'real-pkg': { versions: { '3.1.0': {} } } })
      expect(await check('deps-deprecated', dir)).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toContain('real-pkg')
    })

    it('collects dependencies from workspaces', async () => {
      write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
      write(
        dir,
        'packages/a/package.json',
        JSON.stringify({ dependencies: { dead: '^1' } }),
      )
      mockRegistry({
        dead: { versions: { '1.0.0': { deprecated: 'gone' } } },
      })
      const result = await check('deps-deprecated', dir)
      expect(result).toMatchObject({ pass: false })
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

  describe('secret-codacy-token', () => {
    it('passes when secret present', () => {
      mockSecrets(['CODACY_PROJECT_TOKEN'])
      expect(remoteCheck('secret-codacy-token', 'lzear/repo')).toBe(true)
    })
    it('fails when secret absent', () => {
      mockSecrets(['OTHER_TOKEN'])
      expect(remoteCheck('secret-codacy-token', 'lzear/repo')).toBe(false)
    })
  })
})
