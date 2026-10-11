import * as childProcess from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run as ncuRun } from 'npm-check-updates'
import { publint } from 'publint'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CheckDetail,
  forgeRelease,
  ghProblem,
  latestForgeRelease,
  LOCAL_CHECKS,
  REMOTE_CHECKS,
} from './checks.ts'
import { syncTemplates } from './templates.ts'

vi.mock('publint', () => ({ publint: vi.fn() }))
vi.mock('npm-check-updates', () => ({ run: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const module_ = await importOriginal<typeof childProcess>()
  return {
    ...module_,
    execFile: vi.fn(module_.execFile),
  }
})

// ── helpers ──────────────────────────────────────────────────────────────────

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

type RegistryPackage = {
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

// execFile's callback, as on a process that exits with `status`; a string
// status is a spawn error code
type ExecFileCallback = (
  error: (Error & { code: number | string }) | null,
  stdout: string,
  stderr: string,
) => void

const mockSpawn = (status: number | string, stdout = ''): void => {
  const error =
    status === 0
      ? null
      : Object.assign(new Error(String(status)), { code: status })
  vi.mocked(childProcess.execFile).mockImplementation(((
    ...arguments_: unknown[]
  ) => {
    const callback = arguments_.at(-1) as ExecFileCallback
    callback(error, stdout, '')
  }) as never)
}

const check = async (
  id: string,
  dir: string,
): Promise<boolean | CheckDetail> => {
  const c = LOCAL_CHECKS.find((c) => c.id === id)
  if (!c) throw new Error(`unknown check: ${id}`)
  return c.check(dir)
}

const fix = async (id: string, dir: string): Promise<string> => {
  const c = LOCAL_CHECKS.find((c) => c.id === id)
  if (!c?.fix) throw new Error(`no fix: ${id}`)
  return c.fix(dir)
}

const read = (dir: string, file: string): string =>
  readFileSync(path.join(dir, file), 'utf8')

const sha = (c: string): string => c.repeat(40)

const pin = (path: string, ref: string, comment: string): string =>
  `      uses: lzear/forge/${path}@${ref} # ${comment}\n`

// ── LOCAL_CHECKS ─────────────────────────────────────────────────────────────

describe('LOCAL_CHECKS', () => {
  let dir: string
  beforeEach(() => {
    dir = tmpDir()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('gitignore-env', () => {
    beforeEach(() => {
      childProcess.execFileSync('git', ['init', '--quiet'], { cwd: dir })
    })
    it('passes when .env is ignored', async () => {
      write(dir, '.gitignore', '.env\n')
      expect(await check('gitignore-env', dir)).toBe(true)
    })
    it('fails otherwise', async () => {
      expect(await check('gitignore-env', dir)).toEqual({
        pass: false,
        detail: 'add .env to .gitignore',
      })
    })
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

  describe('forge-pins', () => {
    // v4.10.0 annotated: its tag object's SHA, then the peeled commit
    const LS_REMOTE = [
      `${sha('a')}\trefs/tags/v4.7.0`,
      `${sha('f')}\trefs/tags/v4.10.0`,
      `${sha('b')}\trefs/tags/v4.10.0^{}`,
      `${sha('c')}\trefs/tags/v4.9.0`,
      `${sha('d')}\trefs/tags/v5.0.0-beta.1`,
      `${sha('e')}\trefs/tags/@lzear/forge@9.0.0`,
    ].join('\n')

    it('passes in the forge repo itself, without the network', async () => {
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
      write(
        dir,
        '.github/workflows/main.yml',
        pin('.github/workflows/ci.yml', sha('a'), 'v4.7.0'),
      )
      expect(await check('forge-pins', dir)).toMatchObject({ pass: true })
      expect(vi.mocked(childProcess.execFile)).not.toHaveBeenCalled()
    })
    it('passes without pins, without the network', async () => {
      write(dir, '.github/workflows/ci.yml', 'jobs: {}')
      expect(await check('forge-pins', dir)).toBe(true)
      expect(vi.mocked(childProcess.execFile)).not.toHaveBeenCalled()
    })
    it('passes when every pin is the latest release', async () => {
      mockSpawn(0, LS_REMOTE)
      write(
        dir,
        '.github/workflows/main.yml',
        pin('.github/workflows/ci.yml', sha('b'), 'v4.10.0'),
      )
      write(
        dir,
        '.github/actions/x/action.yaml',
        pin('actions/setup', sha('b'), 'v4.10.0'),
      )
      expect(await check('forge-pins', dir)).toBe(true)
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'git',
        ['ls-remote', '--tags', 'https://github.com/lzear/forge'],
        expect.objectContaining({ cwd: dir }),
        expect.any(Function),
      )
    })
    it('lists stale refs in workflows and actions', async () => {
      mockSpawn(0, LS_REMOTE)
      write(
        dir,
        '.github/workflows/main.yml',
        pin('.github/workflows/ci.yml', sha('a'), 'v4.7.0') +
          pin('.github/workflows/release.yml', sha('9'), 'main'),
      )
      write(
        dir,
        '.github/actions/x/action.yml',
        pin('actions/setup', sha('b'), 'v4.9.0'),
      )
      const result = await check('forge-pins', dir)
      expect(result).toMatchObject({ pass: false })
      expect((result as CheckDetail).detail).toBe(
        [
          '.github/workflows/main.yml: .github/workflows/ci.yml v4.7.0 → v4.10.0',
          '.github/workflows/main.yml: .github/workflows/release.yml main → v4.10.0',
          '.github/actions/x/action.yml: actions/setup v4.10.0 (# v4.9.0) → v4.10.0',
          `Pin to: @${sha('b')} # v4.10.0`,
        ].join('\n'),
      )
    })
    it('passes, unchecked, offline', async () => {
      mockSpawn(128)
      write(
        dir,
        '.github/workflows/main.yml',
        pin('.github/workflows/ci.yml', sha('a'), 'v4.7.0'),
      )
      expect(await check('forge-pins', dir)).toEqual({
        pass: true,
        detail: 'not checked: forge tags unreachable',
      })
    })
    it('latestForgeRelease gives the newest tag and its commit', async () => {
      mockSpawn(0, LS_REMOTE)
      expect(await latestForgeRelease(dir)).toEqual({
        tag: 'v4.10.0',
        sha: sha('b'),
      })
      mockSpawn(128)
      expect(await latestForgeRelease(dir)).toBeNull()
    })
    it('forgeRelease gives the version tag, else the newest', async () => {
      mockSpawn(0, LS_REMOTE)
      expect(await forgeRelease('4.9.0', dir)).toEqual({
        tag: 'v4.9.0',
        sha: sha('c'),
      })
      expect(await forgeRelease('9.9.9', dir)).toEqual({
        tag: 'v4.10.0',
        sha: sha('b'),
      })
      mockSpawn(128)
      expect(await forgeRelease('4.9.0', dir)).toBeNull()
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

  describe('git-hooks', () => {
    it('passes when lefthook.yml is installed by prepare', async () => {
      write(dir, 'lefthook.yml')
      write(
        dir,
        'package.json',
        JSON.stringify({ scripts: { prepare: 'lefthook install' } }),
      )
      expect(await check('git-hooks', dir)).toBe(true)
    })
    it('fails listing every missing piece', async () => {
      write(dir, 'package.json', '{}')
      const result = await check('git-hooks', dir)
      expect(result).toMatchObject({ pass: false })
      const { detail } = result as { detail: string }
      expect(detail).toContain('lefthook.yml missing')
      expect(detail).toContain('"prepare": "lefthook install"')
    })
    it("trusts Bun to run lefthook's postinstall", async () => {
      write(dir, 'lefthook.yml')
      write(
        dir,
        'package.json',
        JSON.stringify({ packageManager: 'bun@1.4.2' }),
      )
      expect(await check('git-hooks', dir)).toBe(true)
    })
    it('fails when Bun trustedDependencies leave lefthook out', async () => {
      write(dir, 'lefthook.yml')
      write(
        dir,
        'package.json',
        JSON.stringify({
          packageManager: 'bun@1.4.2',
          trustedDependencies: ['esbuild'],
        }),
      )
      expect(await check('git-hooks', dir)).toEqual({
        pass: false,
        detail: 'add lefthook to trustedDependencies',
      })
    })
  })

  describe('template-sync', () => {
    it('lists the drifted files', async () => {
      write(dir, 'lefthook.yml', 'pre-commit: {}')
      expect(await check('template-sync', dir)).toEqual({
        pass: false,
        detail: [
          '.editorconfig missing',
          'lefthook.yml differs',
          '.github/zizmor.yml missing',
          'Run: forge sync',
        ].join('\n'),
      })
    })
    it('updates .codacy.yml only where it exists', async () => {
      write(dir, 'package.json', JSON.stringify({ name: 'lib' }))
      await syncTemplates({ dir })
      expect(existsSync(path.join(dir, '.codacy.yml'))).toBe(false)
      write(dir, '.codacy.yml', 'old')
      expect(await check('template-sync', dir)).toEqual({
        pass: false,
        detail: '.codacy.yml differs\nRun: forge sync',
      })
    })
    it('passes once synced', async () => {
      await syncTemplates({ dir })
      expect(await check('template-sync', dir)).toBe(true)
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
    it("packs a workspace package with the root's package manager", async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({
          private: true,
          workspaces: ['packages/*'],
          packageManager: 'bun@1.4.2',
        }),
      )
      write(dir, 'packages/a/package.json', JSON.stringify({}))
      vi.mocked(publint).mockResolvedValue({ messages: [] } as never)
      await check('pkg-publint', dir)
      expect(vi.mocked(publint)).toHaveBeenCalledWith({
        pkgDir: path.join(dir, 'packages/a'),
        pack: 'bun',
      })
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
      expect(vi.mocked(childProcess.execFile)).not.toHaveBeenCalled()
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
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        process.execPath,
        [path.join(dir, 'node_modules/.bin/size-limit')],
        expect.objectContaining({ cwd: path.join(dir, 'packages/a') }),
        expect.any(Function),
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
    it('runs sherif on a pnpm-only workspace', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      write(dir, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
      mockSpawn(1, 'multiple versions of eslint')
      expect(await check('monorepo-lint', dir)).toMatchObject({ pass: false })
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
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['audit']),
        expect.objectContaining({ cwd: dir }),
        expect.any(Function),
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
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'yarn',
        expect.arrayContaining(['npm', 'audit']),
        expect.objectContaining({ cwd: dir }),
        expect.any(Function),
      )
    })
    it('fails Bun only on high severity', async () => {
      write(
        dir,
        'package.json',
        JSON.stringify({ packageManager: 'bun@1.4.2' }),
      )
      mockSpawn(0)
      await check('deps-audit', dir)
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'bun',
        ['audit', '--audit-level=high'],
        expect.objectContaining({ cwd: dir }),
        expect.any(Function),
      )
    })
    it('fails with the error when the command cannot spawn', async () => {
      write(dir, 'package.json', JSON.stringify({}))
      mockSpawn('ENOENT')
      expect(await check('deps-audit', dir)).toEqual({
        pass: false,
        detail: 'Error: ENOENT',
      })
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

    it("skips the workspaces' own packages", async () => {
      write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
      write(
        dir,
        'packages/a/package.json',
        JSON.stringify({ name: '@x/a', dependencies: { '@x/b': '*' } }),
      )
      write(dir, 'packages/b/package.json', JSON.stringify({ name: '@x/b' }))
      mockRegistry({})
      expect(await check('deps-deprecated', dir)).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
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
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'yarn',
        ['config', 'get', 'npmMinimalAgeGate', '--json'],
        expect.objectContaining({ cwd: dir }),
        expect.any(Function),
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

  // ── fixes ──────────────────────────────────────────────────────────────────

  describe('fixes', () => {
    it('has none for deps-fresh: forge update does that', () => {
      expect(
        LOCAL_CHECKS.find((c) => c.id === 'deps-fresh')?.fix,
      ).toBeUndefined()
    })

    describe('git-hooks', () => {
      it('writes lefthook.yml and a prepare script, keeping indentation', async () => {
        write(dir, 'package.json', '{\n\t"scripts": { "build": "x" }\n}\n')
        expect(await fix('git-hooks', dir)).toBe(
          'created lefthook.yml\nprepare: lefthook install',
        )
        expect(read(dir, 'package.json')).toBe(
          '{\n\t"scripts": {\n\t\t"build": "x",\n\t\t"prepare": "lefthook install"\n\t}\n}\n',
        )
        expect(read(dir, 'lefthook.yml')).toContain('lefthook')
        expect(await check('git-hooks', dir)).toBe(true)
      })
      it('chains onto an existing prepare script', async () => {
        write(dir, 'lefthook.yml')
        write(
          dir,
          'package.json',
          JSON.stringify({ scripts: { prepare: 'yarn build' } }),
        )
        expect(await fix('git-hooks', dir)).toBe(
          'prepare: yarn build && lefthook install',
        )
        expect(await check('git-hooks', dir)).toBe(true)
      })
      it('replaces husky in the prepare script', async () => {
        write(dir, 'lefthook.yml')
        write(
          dir,
          'package.json',
          JSON.stringify({ scripts: { prepare: 'husky install && tsc' } }),
        )
        expect(await fix('git-hooks', dir)).toBe(
          'prepare: tsc && lefthook install',
        )
        expect(await check('git-hooks', dir)).toBe(true)
      })
      it('adds lefthook to Bun trustedDependencies', async () => {
        write(dir, 'lefthook.yml', 'pre-commit: {}')
        write(
          dir,
          'package.json',
          JSON.stringify({
            packageManager: 'bun@1.4.2',
            trustedDependencies: ['esbuild'],
          }),
        )
        expect(await fix('git-hooks', dir)).toBe(
          'trustedDependencies: + lefthook',
        )
        expect(read(dir, 'lefthook.yml')).toBe('pre-commit: {}')
        expect(await check('git-hooks', dir)).toBe(true)
      })
    })

    describe('renovate', () => {
      it('creates renovate.json', async () => {
        expect(await fix('renovate', dir)).toBe('created renovate.json')
        expect(await check('renovate', dir)).toBe(true)
      })
      it('adds the preset to extends, keeping indentation', async () => {
        write(dir, 'renovate.json', '{\n    "extends": ["config:base"]\n}')
        await fix('renovate', dir)
        expect(read(dir, 'renovate.json')).toBe(
          '{\n    "extends": [\n        "config:base",\n        "github>lzear/forge"\n    ]\n}',
        )
        expect(await check('renovate', dir)).toBe(true)
      })
      it('throws on invalid JSON', async () => {
        write(dir, 'renovate.json', '{')
        await expect(fix('renovate', dir)).rejects.toThrow()
      })
    })

    describe('deps-release-age', () => {
      it.each([
        ['bunfig.toml', '', '[install]\nminimumReleaseAge = 259200\n'],
        [
          'bunfig.toml',
          '[test]\nroot = "x"\n',
          '[test]\nroot = "x"\n\n[install]\nminimumReleaseAge = 259200\n',
        ],
        [
          'bunfig.toml',
          '[install]\nexact = true\n',
          '[install]\nminimumReleaseAge = 259200\nexact = true\n',
        ],
        [
          'bunfig.toml',
          '[install]\nminimumReleaseAge = 60\n',
          '[install]\nminimumReleaseAge = 259200\n',
        ],
      ])('writes %s from %j', async (file, before, after) => {
        write(dir, 'package.json', '{}')
        write(dir, 'bun.lock')
        if (before) write(dir, file, before)
        expect(await fix('deps-release-age', dir)).toBe(
          'minimumReleaseAge = 259200 in bunfig.toml',
        )
        expect(read(dir, file)).toBe(after)
        expect(await check('deps-release-age', dir)).toBe(true)
      })
      it.each([
        [
          'package-lock.json',
          '.npmrc',
          'save-exact=true',
          'save-exact=true\nmin-release-age=3\n',
        ],
        [
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
          'packages:\n  - a\nminimumReleaseAge: 10\n',
          'packages:\n  - a\nminimumReleaseAge: 4320\n',
        ],
      ])('writes %s: %s', async (lockfile, file, before, after) => {
        write(dir, 'package.json', '{}')
        write(dir, lockfile)
        write(dir, file, before)
        await fix('deps-release-age', dir)
        expect(read(dir, file)).toBe(after)
        expect(await check('deps-release-age', dir)).toBe(true)
      })
      it('sets yarn gate through yarn config', async () => {
        write(
          dir,
          'package.json',
          JSON.stringify({ packageManager: 'yarn@4.18.1' }),
        )
        mockSpawn(0)
        expect(await fix('deps-release-age', dir)).toBe(
          'npmMinimalAgeGate: 3d in .yarnrc.yml',
        )
        expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
          'yarn',
          ['config', 'set', 'npmMinimalAgeGate', '3d'],
          expect.objectContaining({ cwd: dir }),
          expect.any(Function),
        )
        mockSpawn(1, 'nope')
        await expect(fix('deps-release-age', dir)).rejects.toThrow('nope')
      })
      it('throws on Yarn 1', async () => {
        write(
          dir,
          'package.json',
          JSON.stringify({ packageManager: 'yarn@1.22.22' }),
        )
        await expect(fix('deps-release-age', dir)).rejects.toThrow('Yarn 1')
      })
    })

    describe('template-sync', () => {
      it('syncs, listing what changed', async () => {
        await syncTemplates({ dir })
        write(dir, 'lefthook.yml', 'pre-commit: {}')
        expect(await fix('template-sync', dir)).toBe('lefthook.yml updated')
        expect(await check('template-sync', dir)).toBe(true)
      })
    })

    describe('forge-pins', () => {
      const LS_REMOTE = [
        `${sha('a')}\trefs/tags/v4.7.0`,
        `${sha('b')}\trefs/tags/v4.10.0`,
      ].join('\n')

      it('repins stale refs to the latest release', async () => {
        mockSpawn(0, LS_REMOTE)
        write(
          dir,
          '.github/workflows/main.yml',
          'on: push\njobs:\n  ci:\n' +
            pin('.github/workflows/ci.yml', sha('a'), 'v4.7.0') +
            '      uses: lzear/forge/.github/workflows/release.yml@main\n',
        )
        write(
          dir,
          '.github/actions/x/action.yml',
          pin('actions/setup', sha('b'), 'v4.10.0'),
        )
        expect(await fix('forge-pins', dir)).toBe(
          '.github/workflows/main.yml → v4.10.0',
        )
        expect(read(dir, '.github/workflows/main.yml')).toBe(
          'on: push\njobs:\n  ci:\n' +
            pin('.github/workflows/ci.yml', sha('b'), 'v4.10.0') +
            pin('.github/workflows/release.yml', sha('b'), 'v4.10.0'),
        )
        expect(await check('forge-pins', dir)).toBe(true)
      })
      it('throws offline', async () => {
        mockSpawn(128)
        await expect(fix('forge-pins', dir)).rejects.toThrow('unreachable')
      })
    })
  })
})

// ── REMOTE_CHECKS ─────────────────────────────────────────────────────────────

const repo = 'lzear/repo'

// answers each `gh` call from the first entry whose key its arguments start
// with: JSON to print, or a failing exit status
const mockGh = (answers: Record<string, unknown>): void => {
  vi.mocked(childProcess.execFile).mockImplementation(((
    ...arguments_: unknown[]
  ) => {
    const callback = arguments_.at(-1) as ExecFileCallback
    const call = (arguments_[1] as string[]).join(' ')
    const answer = Object.entries(answers).find(([key]) =>
      call.startsWith(key),
    )?.[1]
    if (typeof answer === 'number')
      callback(
        Object.assign(new Error('gh'), { code: answer }),
        '',
        'gh: Not Found (HTTP 404)',
      )
    else callback(null, JSON.stringify(answer), '')
  }) as never)
}

const renovateActive = async (
  dir = tmpDir(),
): Promise<boolean | CheckDetail> => {
  const c = REMOTE_CHECKS.find((c) => c.id === 'renovate-active')
  if (!c) throw new Error('unknown check: renovate-active')
  return c.check(repo, dir)
}

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString()

const withRenovate = (): string => {
  const dir = tmpDir()
  write(dir, 'renovate.json', '{}')
  return dir
}

type Issue = { title: string; state: string; created_at: string }

const issue = (title: string, state: string, days: number): Issue => ({
  title,
  state,
  created_at: daysAgo(days),
})

const pr = (days: number): Issue & { pull_request: object } => ({
  ...issue('chore(deps): x', 'closed', days),
  pull_request: {},
})

const answerIssues = (issues: unknown[]): void => {
  mockGh({ [`api repos/${repo}/issues?`]: issues })
}

describe('REMOTE_CHECKS', () => {
  afterEach(() => vi.clearAllMocks())

  describe('ghProblem', () => {
    it('passes when authenticated', async () => {
      mockSpawn(0)
      expect(await ghProblem()).toBeNull()
    })
    it('says gh is unauthenticated', async () => {
      mockSpawn(1)
      expect(await ghProblem()).toMatch('gh auth login')
    })
    it('says gh is missing', async () => {
      mockSpawn('ENOENT')
      expect(await ghProblem()).toMatch('not installed')
    })
  })

  describe('renovate-active', () => {
    it('skips repos without renovate.json', async () => {
      expect(await renovateActive()).toEqual({
        pass: true,
        detail: 'no renovate.json',
      })
      expect(vi.mocked(childProcess.execFile)).not.toHaveBeenCalled()
    })
    it('passes on an open Dependency Dashboard', async () => {
      answerIssues([issue('Dependency Dashboard', 'open', 400)])
      expect(await renovateActive(withRenovate())).toBe(true)
      expect(vi.mocked(childProcess.execFile)).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          `repos/${repo}/issues?creator=renovate%5Bbot%5D&state=all&sort=created&direction=desc&per_page=100`,
        ],
        expect.anything(),
        expect.anything(),
      )
    })
    it('passes on a recent PR', async () => {
      answerIssues([pr(10)])
      expect(await renovateActive(withRenovate())).toBe(true)
    })
    it('fails on a closed dashboard and old PRs', async () => {
      answerIssues([issue('Dependency Dashboard', 'closed', 1), pr(61)])
      expect(await renovateActive(withRenovate())).toEqual({
        pass: false,
        detail: expect.stringContaining('60 days') as string,
      })
    })
  })
})
