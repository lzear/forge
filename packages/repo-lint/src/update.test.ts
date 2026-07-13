import * as childProcess from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run as ncuRun } from 'npm-check-updates'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectPackageManager,
  installCommands,
  runUpdate,
  type UpdateResult,
} from './update.js'

vi.mock('npm-check-updates', () => ({ run: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const module_ = await importOriginal<typeof import('node:child_process')>()
  return { ...module_, spawnSync: vi.fn() }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ── helpers ──────────────────────────────────────────────────────────────────

const tmpDir = (): string => mkdtempSync(path.join(tmpdir(), 'update-test-'))

const write = (dir: string, file: string, content = ''): void => {
  writeFileSync(path.join(dir, file), content)
}

const read = (dir: string, file: string): string =>
  readFileSync(path.join(dir, file), 'utf8')

const mockRegistry = (versions: Record<string, string>): void => {
  fetchMock.mockImplementation((url: string) => {
    for (const [name, version] of Object.entries(versions))
      if (url.includes(name))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version }),
        })
    if (url.includes('nodejs.org'))
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { version: 'v27.1.0', lts: false },
            { version: 'v26.3.0', lts: 'Krypton' },
            { version: 'v24.9.0', lts: 'Jod' },
          ]),
      })
    return Promise.resolve({ ok: false, status: 404 })
  })
}

const resultById = (
  results: UpdateResult[],
  id: string,
): UpdateResult | undefined => results.find((r) => r.id === id)

// ── detectPackageManager ─────────────────────────────────────────────────────

describe('detectPackageManager', () => {
  let dir: string
  beforeEach(() => {
    dir = tmpDir()
  })

  it('reads the packageManager field', () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.1.0' }),
    )
    expect(detectPackageManager(dir)).toEqual({
      name: 'pnpm',
      version: '10.1.0',
      source: 'packageManager',
    })
  })

  it('strips the integrity hash from the packageManager field', () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'yarn@4.17.1+sha224.deadbeef' }),
    )
    expect(detectPackageManager(dir)).toEqual({
      name: 'yarn',
      version: '4.17.1',
      source: 'packageManager',
    })
  })

  it.each([
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ])('detects %s → %s', (lockfile, name) => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, lockfile)
    expect(detectPackageManager(dir)).toEqual({ name, source: 'lockfile' })
  })

  it('defaults to npm', () => {
    expect(detectPackageManager(dir)).toEqual({
      name: 'npm',
      source: 'default',
    })
  })
})

// ── installCommands ──────────────────────────────────────────────────────────

describe('installCommands', () => {
  it('uses yarn up for yarn berry', () => {
    expect(
      installCommands({
        name: 'yarn',
        version: '4.17.1',
        source: 'packageManager',
      }),
    ).toEqual([
      ['yarn', 'install'],
      ['yarn', 'up', '--recursive', '*'],
      ['yarn', 'dedupe'],
    ])
  })

  it('uses yarn upgrade for yarn classic', () => {
    expect(
      installCommands({
        name: 'yarn',
        version: '1.22.22',
        source: 'packageManager',
      }),
    ).toEqual([
      ['yarn', 'install'],
      ['yarn', 'upgrade'],
    ])
  })

  it('uses a single bun update for bun', () => {
    expect(installCommands({ name: 'bun', source: 'lockfile' })).toEqual([
      ['bun', 'update'],
    ])
  })

  it('uses recursive update for pnpm', () => {
    expect(installCommands({ name: 'pnpm', source: 'lockfile' })).toEqual([
      ['pnpm', 'install'],
      ['pnpm', 'update', '--recursive'],
      ['pnpm', 'dedupe'],
    ])
  })

  it('uses npm update for npm', () => {
    expect(installCommands({ name: 'npm', source: 'default' })).toEqual([
      ['npm', 'install'],
      ['npm', 'update'],
      ['npm', 'dedupe'],
    ])
  })
})

// ── runUpdate ────────────────────────────────────────────────────────────────

describe('runUpdate', () => {
  let dir: string
  beforeEach(() => {
    dir = tmpDir()
    vi.mocked(ncuRun).mockResolvedValue({})
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 0,
      output: [],
      signal: null,
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reports dependency upgrades from ncu', async () => {
    write(dir, 'package.json', JSON.stringify({ packageManager: 'npm@11.0.0' }))
    mockRegistry({ npm: '11.0.0' })
    vi.mocked(ncuRun).mockResolvedValue({ react: '^19' })
    const report = await runUpdate({ dir, dry: true })
    const deps = resultById(report.results, 'deps')
    expect(deps).toMatchObject({ pass: true, changed: true })
    expect(deps?.detail).toContain('react')
  })

  it('passes .ncurc.json config (e.g. reject) through to ncu', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.ncurc.json', JSON.stringify({ reject: ['commander'] }))
    mockRegistry({})
    const report = await runUpdate({ dir, dry: true })
    expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
      expect.objectContaining({ reject: ['commander'] }),
    )
    expect(resultById(report.results, 'deps')?.detail).toContain('.ncurc.json')
  })

  it('does not let .ncurc.json override forge update behavior', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.ncurc.json', JSON.stringify({ upgrade: false, silent: false }))
    mockRegistry({})
    await runUpdate({ dir, install: false })
    expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
      expect.objectContaining({ upgrade: true, silent: true }),
    )
  })

  it('uses workspaces mode when the root has workspaces', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({
        workspaces: ['packages/*'],
        packageManager: 'npm@11.0.0',
      }),
    )
    mockRegistry({ npm: '11.0.0' })
    vi.mocked(ncuRun).mockResolvedValue({})
    await runUpdate({ dir, dry: true })
    expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaces: true, root: true }),
    )
  })

  it('bumps the packageManager field and preserves indentation', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ name: 'x', packageManager: 'pnpm@10.0.0' }, null, 4) +
        '\n',
    )
    mockRegistry({ pnpm: '10.5.0' })
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      pass: true,
      changed: true,
    })
    const raw = read(dir, 'package.json')
    expect(raw).toContain('"packageManager": "pnpm@10.5.0"')
    expect(raw).toContain('    "name"')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('resolves yarn berry from @yarnpkg/cli-dist', async () => {
    write(dir, 'package.json', JSON.stringify({ packageManager: 'yarn@4.0.0' }))
    mockRegistry({ 'yarnpkg%2Fcli-dist': '4.9.0' })
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'package-manager')?.detail).toContain(
      '4.9.0',
    )
    const package_ = JSON.parse(read(dir, 'package.json')) as {
      packageManager: string
    }
    expect(package_.packageManager).toBe('yarn@4.9.0')
  })

  it('does not write in dry mode', async () => {
    const original =
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }, null, 2) + '\n'
    write(dir, 'package.json', original)
    mockRegistry({ pnpm: '10.5.0' })
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      changed: true,
    })
    expect(read(dir, 'package.json')).toBe(original)
    expect(vi.mocked(childProcess.spawnSync)).not.toHaveBeenCalled()
  })

  it('skips the packageManager step when the field is absent', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    mockRegistry({ npm: '11.0.0' })
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      pass: true,
      changed: false,
    })
  })

  it('updates .nvmrc to the latest LTS, preserving the v prefix', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.nvmrc', 'v24.0.0\n')
    mockRegistry({})
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'node-version')).toMatchObject({
      pass: true,
      changed: true,
    })
    expect(read(dir, '.nvmrc')).toBe('v26.3.0\n')
  })

  it('updates .bun-version', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.bun-version', '1.1.0\n')
    mockRegistry({ bun: '1.3.5' })
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'bun-version')).toMatchObject({
      pass: true,
      changed: true,
    })
    expect(read(dir, '.bun-version')).toBe('1.3.5\n')
  })

  it('extends a single copyright year into a range ending this year', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, 'LICENSE', 'MIT License\n\nCopyright (c) 2023 lzear\n')
    mockRegistry({})
    const year = new Date().getFullYear()
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'license-year')).toMatchObject({
      pass: true,
      changed: true,
    })
    expect(read(dir, 'LICENSE')).toBe(
      `MIT License\n\nCopyright (c) 2023-${year} lzear\n`,
    )
  })

  it('bumps the end of an existing copyright range', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, 'LICENSE', 'Copyright (c) 2019-2024 lzear\n')
    mockRegistry({})
    const year = new Date().getFullYear()
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'license-year')).toMatchObject({
      changed: true,
    })
    expect(read(dir, 'LICENSE')).toBe(`Copyright (c) 2019-${year} lzear\n`)
  })

  it('leaves a current copyright year alone', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    const year = new Date().getFullYear()
    write(dir, 'LICENSE', `Copyright (c) ${year} lzear\n`)
    mockRegistry({})
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'license-year')).toMatchObject({
      pass: true,
      changed: false,
    })
  })

  it('runs install commands for the detected package manager', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
    )
    mockRegistry({ pnpm: '10.0.0' })
    const report = await runUpdate({ dir })
    expect(resultById(report.results, 'install')).toMatchObject({ pass: true })
    expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
      'pnpm',
      ['install'],
      expect.objectContaining({ cwd: dir }),
    )
    expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
      'pnpm',
      ['update', '--recursive'],
      expect.objectContaining({ cwd: dir }),
    )
  })

  it('fails the install step when a command exits non-zero', async () => {
    write(dir, 'package.json', JSON.stringify({ packageManager: 'npm@11.0.0' }))
    mockRegistry({ npm: '11.0.0' })
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 0,
      output: [],
      signal: null,
    })
    const report = await runUpdate({ dir })
    expect(resultById(report.results, 'install')).toMatchObject({ pass: false })
  })

  it('reports registry failures without throwing', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
    )
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      pass: false,
    })
  })
})
