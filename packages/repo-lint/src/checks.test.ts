import * as childProcess from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run as ncuRun } from 'npm-check-updates'
import { publint } from 'publint'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CheckDetail, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.ts'

vi.mock('publint', () => ({ publint: vi.fn() }))
vi.mock('npm-check-updates', () => ({ run: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const module_ = await importOriginal<typeof childProcess>()
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

  describe('jsr-config', () => {
    const package_ = JSON.stringify({ name: '@x/a', version: '1.0.0' })

    it('passes without deno.json', async () => {
      write(dir, 'package.json', package_)
      expect(await check('jsr-config', dir)).toMatchObject({ pass: true })
    })
    it('passes when name and version match', async () => {
      write(dir, 'package.json', package_)
      write(dir, 'deno.json', package_)
      expect(await check('jsr-config', dir)).toMatchObject({ pass: true })
    })
    it('fails on invalid JSON', async () => {
      write(dir, 'package.json', package_)
      write(dir, 'deno.json', '{')
      expect(await check('jsr-config', dir)).toMatchObject({
        pass: false,
        detail: 'deno.json is not valid JSON',
      })
    })
    it('lists name and version drift', async () => {
      write(dir, 'package.json', package_)
      write(
        dir,
        'deno.json',
        JSON.stringify({ name: '@x/b', version: '0.9.0' }),
      )
      expect(await check('jsr-config', dir)).toMatchObject({
        pass: false,
        detail: 'name @x/b does not match package.json\nversion 0.9.0 != 1.0.0',
      })
    })
  })

  describe('ci-workflow', () => {
    it('fails when no workflows exist', async () => {
      const result = await check('ci-workflow', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as CheckDetail).detail).toContain(
        'lzear/forge/.github/workflows/ci.yml@',
      )
    })
    it('fails on a local ci.yml copy that never calls forge', async () => {
      write(dir, '.github/workflows/ci.yml', 'on: workflow_call\njobs: {}')
      expect(await check('ci-workflow', dir)).toMatchObject({ pass: false })
    })
    it('passes when a workflow calls the forge reusable CI', async () => {
      write(
        dir,
        '.github/workflows/main.yml',
        'jobs:\n  ci:\n    uses: lzear/forge/.github/workflows/ci.yml@0d0f417 # v4.3.0\n',
      )
      expect(await check('ci-workflow', dir)).toBe(true)
    })
    it('passes in the forge repo itself (hosts the workflow)', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(
        dir,
        'packages/forge/package.json',
        JSON.stringify({ name: '@lzear/forge' }),
      )
      write(dir, '.github/workflows/ci.yml', 'on: workflow_call\njobs: {}')
      expect(await check('ci-workflow', dir)).toBe(true)
    })
  })

  describe('renovate', () => {
    it('fails when missing', async () => {
      expect(await check('renovate', dir)).toBe(false)
    })
    it('fails on invalid JSON', async () => {
      write(dir, 'renovate.json', '{')
      expect(await check('renovate', dir)).toMatchObject({ pass: false })
    })
    it('fails without the forge preset', async () => {
      write(dir, 'renovate.json', '{"extends":["github>lzear/forge-x"]}')
      expect(await check('renovate', dir)).toMatchObject({ pass: false })
    })
    it('passes when extending the forge preset', async () => {
      write(dir, 'renovate.json', '{"extends":["github>lzear/forge#v4"]}')
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
    it('checks a workspace listed by its plain path', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['lib'] }),
      )
      write(dir, 'lib/package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({
        messages: [{ type: 'error', code: 'FILE_INVALID_FORMAT' }],
      } as never)
      expect(await check('pkg-publint', dir)).toMatchObject({ pass: false })
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

  describe('pkg-size-limit', () => {
    it('skips repos without a size-limit config', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      expect(await check('pkg-size-limit', dir)).toBe(true)
      expect(vi.mocked(childProcess.spawnSync)).not.toHaveBeenCalled()
    })
    it('fails when configured but not installed', async () => {
      write(dir, '.size-limit.json', '[]')
      const result = await check('pkg-size-limit', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('not installed')
    })
    it('runs the repo bin where the package.json field lives', async () => {
      write(dir, 'node_modules/.bin/size-limit')
      write(
        dir,
        'package.json',
        JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      )
      write(
        dir,
        'packages/a/package.json',
        JSON.stringify({ 'size-limit': [{ path: 'dist/index.js' }] }),
      )
      mockSpawn(0)
      expect(await check('pkg-size-limit', dir)).toBe(true)
      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
        process.execPath,
        [path.join(dir, 'node_modules/.bin/size-limit')],
        expect.objectContaining({ cwd: path.join(dir, 'packages/a') }),
      )
    })
    it('fails with output when over the limit', async () => {
      write(dir, 'node_modules/.bin/size-limit')
      write(dir, '.size-limit.ts', 'export default []')
      mockSpawn(1, 'Package size limit has exceeded by 1 kB')
      const result = await check('pkg-size-limit', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('exceeded')
    })
  })

  describe('pkg-fallow', () => {
    it('passes when fallow exits 0', async () => {
      mockSpawn(0)
      expect(await check('pkg-fallow', dir)).toMatchObject({ pass: true })
    })
    it('fails when fallow exits 1', async () => {
      mockSpawn(1, 'unused-export:src/foo.ts:1:bar')
      const result = await check('pkg-fallow', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as { detail: string }).detail).toContain('unused-export')
      expect((result as { detail: string }).detail).toContain('npx fallow')
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
    it('applies .ncurc rejects without upgrading', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      write(dir, '.ncurc.json', JSON.stringify({ reject: ['react'] }))
      vi.mocked(ncuRun).mockResolvedValue({})
      expect(await check('deps-fresh', dir)).toBe(true)
      expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
        expect.objectContaining({ reject: ['react'], upgrade: false }),
      )
    })
    it.each([
      { workspaces: ['packages/*'] },
      { workspaces: { packages: ['packages/*'] } },
    ])('uses workspaces mode for monorepos (%j)', async (package_) => {
      write(dir, 'package.json', JSON.stringify(package_))
      vi.mocked(ncuRun).mockResolvedValue({})
      await check('deps-fresh', dir)
      expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
        expect.objectContaining({ workspaces: true }),
      )
    })
  })

  describe('deps-release-age', () => {
    const yarn4 = JSON.stringify({ packageManager: 'yarn@4.18.1' })

    it.each([
      ['bun.lock', 'bunfig.toml', '[install]\nminimumReleaseAge = 259200\n'],
      ['package-lock.json', '.npmrc', 'min-release-age=3\n'],
      ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'minimumReleaseAge: 4320\n'],
    ])('passes on 3 days (%s, %s)', async (lockfile, file, content) => {
      write(dir, 'package.json', JSON.stringify({}))
      write(dir, lockfile)
      write(dir, file, content)
      expect(await check('deps-release-age', dir)).toBe(true)
    })
    it('fails with the setting to add when unset', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      write(dir, 'bun.lock')
      expect(await check('deps-release-age', dir)).toEqual({
        pass: false,
        detail: '0 days — set minimumReleaseAge to 259200 in bunfig.toml',
      })
    })
    it("reads yarn's gate through yarn config", async () => {
      write(dir, 'package.json', yarn4)
      mockSpawn(0, '4320\n')
      expect(await check('deps-release-age', dir)).toBe(true)
      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
        'yarn',
        ['config', 'get', 'npmMinimalAgeGate'],
        expect.objectContaining({ cwd: dir }),
      )
    })
    it("fails on yarn's 1-day default", async () => {
      write(dir, 'package.json', yarn4)
      mockSpawn(0, '1440\n')
      expect(await check('deps-release-age', dir)).toMatchObject({
        pass: false,
        detail: '1 days — set npmMinimalAgeGate to 4320 in .yarnrc.yml',
      })
    })
    it('fails on Yarn 1', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ packageManager: 'yarn@1.22.22' }),
      )
      expect(await check('deps-release-age', dir)).toMatchObject({
        pass: false,
        detail: expect.stringContaining('Yarn 1'),
      })
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
