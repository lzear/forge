import * as childProcess from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run as ncuRun } from 'npm-check-updates'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectPackageManager,
  getWorkspaceDirectories,
  installCommands,
  run,
  runUpdate,
  type UpdateResult,
} from './update.ts'

vi.mock('npm-check-updates', () => ({ run: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const module_ = await importOriginal<typeof childProcess>()
  return { ...module_, execFile: vi.fn(), spawnSync: vi.fn() }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ── helpers ──────────────────────────────────────────────────────────────────

const tmpDir = (): string => mkdtempSync(path.join(tmpdir(), 'update-test-'))

const write = (dir: string, file: string, content = ''): void => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  writeFileSync(path.join(dir, file), content)
}

const read = (dir: string, file: string): string =>
  readFileSync(path.join(dir, file), 'utf8')

const daysAgo = (days: number): string =>
  Temporal.Now.instant()
    .subtract({ milliseconds: days * 86_400_000 })
    .toString({ smallestUnit: 'millisecond' })

// sha512-<base64> of a fake tarball, `seed` repeated
const integrity = (seed: number): string =>
  `sha512-${new Uint8Array(64).fill(seed).toBase64()}`

// a packument whose releases are { version: age in days }, latest last
const packument = (releases: Record<string, number>): object => ({
  'dist-tags': { latest: Object.keys(releases).at(-1) },
  time: Object.fromEntries(
    Object.entries(releases).map(([v, age]) => [v, daysAgo(age)]),
  ),
  versions: Object.fromEntries(
    Object.keys(releases).map((v, index) => [
      v,
      { dist: { integrity: integrity(index + 1) } },
    ]),
  ),
})

const NODE_INDEX = [
  { version: 'v27.1.0', date: daysAgo(10).slice(0, 10), lts: false },
  { version: 'v26.4.0', date: daysAgo(1).slice(0, 10), lts: 'Krypton' },
  { version: 'v26.3.0', date: daysAgo(20).slice(0, 10), lts: 'Krypton' },
  { version: 'v24.9.0', date: daysAgo(40).slice(0, 10), lts: 'Jod' },
]

const mockRegistry = (
  versions: Record<string, string | Record<string, number>>,
): void => {
  fetchMock.mockImplementation((url: string) => {
    for (const [name, version] of Object.entries(versions))
      if (url.includes(name))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              packument(
                typeof version === 'string' ? { [version]: 10 } : version,
              ),
            ),
        })
    if (new URL(url).hostname === 'nodejs.org')
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(NODE_INDEX),
      })
    return Promise.resolve({ ok: false, status: 404 })
  })
}

// `git ls-remote --tags` per GitHub repo: { tag: commit letter }
const mockTags = (repos: Record<string, Record<string, string>>): void => {
  vi.mocked(childProcess.execFile).mockImplementation(((
    ...arguments_: unknown[]
  ) => {
    const url = (arguments_[1] as string[]).at(-1) ?? ''
    const tags = repos[url.replace('https://github.com/', '')]
    const callback = arguments_.at(-1) as (
      error: (Error & { code: number }) | null,
      stdout: string,
      stderr: string,
    ) => void
    if (tags)
      callback(
        null,
        Object.entries(tags)
          .map(([tag, letter]) => `${sha(letter)}\trefs/tags/${tag}\n`)
          .join(''),
        '',
      )
    else callback(Object.assign(new Error('128'), { code: 128 }), '', '')
  }) as never)
}

const sha = (letter: string): string => letter.repeat(40)

// GitHub releases per repo: { tag: age in days }
const mockReleases = (repos: Record<string, Record<string, number>>): void => {
  fetchMock.mockImplementation((url: string) => {
    const repo = /repos\/(.+)\/releases/.exec(url)?.[1] ?? ''
    const releases = repos[repo]
    if (!releases) return Promise.resolve({ ok: false, status: 404 })
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          Object.entries(releases).map(([tag_name, age]) => ({
            tag_name,
            published_at: daysAgo(age),
            draft: false,
            prerelease: false,
          })),
        ),
    })
  })
}

const resultById = (
  results: UpdateResult[],
  id: string,
): UpdateResult | undefined => results.find((r) => r.id === id)

// a temp root whose package.json is `root`, with a package at each path
const layout = (root: object, packages: string[]): string => {
  const dir = tmpDir()
  write(dir, 'package.json', JSON.stringify(root))
  for (const p of packages) write(dir, `${p}/package.json`, '{}')
  return dir
}
const relative = (dir: string): string[] =>
  getWorkspaceDirectories(dir).map((d) => path.relative(dir, d))

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
      ['yarn', 'up', '--recursive', '*', '@*/*'],
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

  it('updates all bun workspaces, then reinstalls', () => {
    expect(installCommands({ name: 'bun', source: 'lockfile' })).toEqual([
      ['bun', 'update', '--recursive'],
      ['bun', 'install'],
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

// ── getWorkspaceDirectories ──────────────────────────────────────────────────

describe('getWorkspaceDirectories', () => {
  it('resolves dir/* and literal paths, sorted, skipping dirs without a package.json', () => {
    const dir = layout({ workspaces: ['tools/cli', 'packages/*'] }, [
      'packages/b',
      'packages/a',
      'tools/cli',
    ])
    mkdirSync(path.join(dir, 'packages/empty'))
    expect(relative(dir)).toEqual(['packages/a', 'packages/b', 'tools/cli'])
  })

  it('reads { packages } and resolves ** without node_modules', () => {
    const dir = layout({ workspaces: { packages: ['apps/**'] } }, [
      'apps/web',
      'apps/group/api',
      'apps/web/node_modules/dep',
    ])
    expect(relative(dir)).toEqual(['apps/group/api', 'apps/web'])
  })

  it('excludes ! negations', () => {
    const dir = layout(
      { workspaces: ['packages/*', './packages/*/', '!packages/legacy'] },
      ['packages/a', 'packages/legacy'],
    )
    expect(relative(dir)).toEqual(['packages/a'])
  })

  it("reads pnpm-workspace.yaml's packages list", () => {
    const dir = layout({}, ['packages/a', 'apps/web', 'apps/test/e2e'])
    write(
      dir,
      'pnpm-workspace.yaml',
      [
        '# workspace',
        'packages:',
        "  - 'packages/*'",
        '  - "apps/**" # all apps',
        '',
        '  - !apps/test/**',
        'catalog:',
        '  - not/a/package',
        '',
      ].join('\n'),
    )
    expect(relative(dir)).toEqual(['apps/web', 'packages/a'])
  })

  it('prefers package.json workspaces over pnpm-workspace.yaml', () => {
    const dir = layout({ workspaces: ['packages/*'] }, ['packages/a', 'apps/b'])
    write(dir, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    expect(relative(dir)).toEqual(['packages/a'])
  })

  it('returns nothing without workspaces', () => {
    expect(relative(layout({}, ['packages/a']))).toEqual([])
    expect(getWorkspaceDirectories(tmpDir())).toEqual([])
  })
})

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

  it('waits 3 days for new versions, except own packages', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    mockRegistry({})
    await runUpdate({ dir, dry: true })
    const days = vi.mocked(ncuRun).mock.calls[0]?.[0]?.cooldown as (
      name: string,
    ) => number
    const names = ['react', '@lzear/forge', 'votes', 'votes-ui']
    expect(names.map((name) => days(name))).toEqual([3, 0, 0, 3])
  })

  it('lets .ncurc.json override the cooldown', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.ncurc.json', JSON.stringify({ cooldown: 0 }))
    mockRegistry({})
    await runUpdate({ dir, dry: true })
    expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
      expect.objectContaining({ cooldown: 0 }),
    )
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

  it('uses workspaces mode for a pnpm-workspace.yaml', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    mockRegistry({})
    await runUpdate({ dir, dry: true })
    expect(vi.mocked(ncuRun)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaces: true, root: true }),
    )
  })

  it('leaves workspaces that are git submodules alone', async () => {
    write(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
    for (const name of ['a', 'b', 'vendored']) {
      mkdirSync(path.join(dir, 'packages', name), { recursive: true })
      write(dir, `packages/${name}/package.json`, JSON.stringify({ name }))
    }
    write(dir, 'packages/vendored/.git', 'gitdir: ../../.git/modules/vendored')
    mockRegistry({})
    vi.mocked(ncuRun).mockResolvedValue({
      [path.join(dir, 'packages/a/package.json')]: { react: '^19' },
    })
    const report = await runUpdate({ dir, dry: true })
    const options = vi.mocked(ncuRun).mock.calls[0]?.[0]
    expect(options).toMatchObject({ root: true })
    expect(options).not.toHaveProperty('workspaces')
    expect(options?.workspace).toEqual(expect.arrayContaining(['a', 'b']))
    expect(options?.workspace).toHaveLength(2)
    expect(resultById(report.results, 'deps')?.detail).toContain('react')
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

  it('skips a release younger than the age gate', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
    )
    write(dir, '.bun-version', '1.3.0\n')
    mockRegistry({
      pnpm: { '10.0.0': 30, '10.5.0': 5, '11.0.0-rc.1': 4, '10.6.0': 1 },
      bun: { '1.3.0': 30, '1.3.5': 4, '1.3.6': 2 },
    })
    await runUpdate({ dir, install: false })
    expect(read(dir, 'package.json')).toContain('"pnpm@10.5.0"')
    expect(read(dir, '.bun-version')).toBe('1.3.5\n')
  })

  it('fails when no release passed the age gate', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
    )
    mockRegistry({ pnpm: { '10.0.0': 1 } })
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      pass: false,
    })
  })

  it('never downgrades past a hand-picked release', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'pnpm@10.6.0' }),
    )
    write(dir, '.bun-version', '1.3.6\n')
    mockRegistry({
      pnpm: { '10.5.0': 5, '10.6.0': 1 },
      bun: { '1.3.5': 5, '1.3.6': 1 },
    })
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'package-manager')).toMatchObject({
      changed: false,
    })
    expect(resultById(report.results, 'bun-version')).toMatchObject({
      changed: false,
    })
    expect(read(dir, '.bun-version')).toBe('1.3.6\n')
  })

  it('refreshes the corepack hash of the new release', async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ packageManager: 'yarn@4.0.0+sha512.deadbeef' }),
    )
    mockRegistry({ 'yarnpkg%2Fcli-dist': { '4.0.0': 30, '4.9.0': 10 } })
    await runUpdate({ dir, install: false })
    const package_ = JSON.parse(read(dir, 'package.json')) as {
      packageManager: string
    }
    expect(package_.packageManager).toBe(`yarn@4.9.0+sha512.${'02'.repeat(64)}`)
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

  it('updates .nvmrc to the newest LTS past the age gate, preserving the v prefix', async () => {
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

  it.each([
    ['v22', 'v26'],
    ['24.9', '26.3'],
    ['lts/*', 'lts/*'],
  ])('keeps the shape of .nvmrc %s', async (before, after) => {
    write(dir, 'package.json', JSON.stringify({}))
    write(dir, '.nvmrc', `${before}\n`)
    mockRegistry({})
    await runUpdate({ dir, install: false })
    expect(read(dir, '.nvmrc')).toBe(`${after}\n`)
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
    const year = Temporal.Now.plainDateISO().year
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
    const year = Temporal.Now.plainDateISO().year
    const report = await runUpdate({ dir, install: false })
    expect(resultById(report.results, 'license-year')).toMatchObject({
      changed: true,
    })
    expect(read(dir, 'LICENSE')).toBe(`Copyright (c) 2019-${year} lzear\n`)
  })

  it('keeps an en or em dash when bumping a copyright range', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    write(
      dir,
      'LICENSE',
      'Copyright (c) 2019–2024 lzear\nCopyright 2020 — 2021\n',
    )
    mockRegistry({})
    const year = Temporal.Now.plainDateISO().year
    await runUpdate({ dir, install: false })
    expect(read(dir, 'LICENSE')).toBe(
      `Copyright (c) 2019–${year} lzear\nCopyright 2020 — 2021\n`,
    )
    write(dir, 'LICENSE', 'Copyright 2020 — 2021\n')
    await runUpdate({ dir, install: false })
    expect(read(dir, 'LICENSE')).toBe(`Copyright 2020 — ${year}\n`)
  })

  it('leaves a current en-dash range alone', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    const year = Temporal.Now.plainDateISO().year
    write(dir, 'LICENSE', `Copyright (c) 2023–${year} lzear\n`)
    mockRegistry({})
    const report = await runUpdate({ dir, dry: true })
    expect(resultById(report.results, 'license-year')).toMatchObject({
      changed: false,
      detail: `2023–${year} is current`,
    })
  })

  it('leaves a current copyright year alone', async () => {
    write(dir, 'package.json', JSON.stringify({}))
    const year = Temporal.Now.plainDateISO().year
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

  it('keeps the ranges bun update rewrites', async () => {
    const root = JSON.stringify({
      packageManager: 'bun@1.3.5',
      workspaces: ['packages/*'],
      dependencies: { ms: '^2' },
    })
    const member = JSON.stringify({ dependencies: { picocolors: '^1' } })
    write(dir, 'package.json', root)
    write(dir, 'packages/a/package.json', member)
    mockRegistry({ bun: '1.3.5' })
    vi.mocked(childProcess.spawnSync).mockImplementation(() => {
      write(dir, 'package.json', root.replace('^2', '^2.1.3'))
      write(dir, 'packages/a/package.json', member.replace('^1', '^1.1.1'))
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      }
    })
    const report = await runUpdate({ dir })
    expect(resultById(report.results, 'install')).toMatchObject({ pass: true })
    expect(read(dir, 'package.json')).toBe(root)
    expect(read(dir, 'packages/a/package.json')).toBe(member)
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

  it('runs only the steps asked for, minus the skipped', async () => {
    write(dir, 'package.json', '{}')
    const ids = async (only?: string[], skip?: string[]): Promise<string[]> => {
      const report = await runUpdate({
        dir,
        ...(only && { only }),
        ...(skip && { skip }),
      })
      return report.results.map((r) => r.id)
    }
    expect(await ids(['license-year', 'actions'])).toEqual([
      'actions',
      'license-year',
    ])
    expect(await ids(undefined, ['deps', 'install'])).toEqual([
      'package-manager',
      'node-version',
      'bun-version',
      'actions',
      'license-year',
    ])
    expect(childProcess.spawnSync).not.toHaveBeenCalled()
    await expect(runUpdate({ dir, skip: ['nope'] })).rejects.toThrow(
      'Unknown step: nope',
    )
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

describe('run', () => {
  it('buffers output past the 1 MB default', async () => {
    vi.mocked(childProcess.execFile).mockImplementation(((
      ...arguments_: unknown[]
    ) => {
      const callback = arguments_.at(-1) as (
        error: null,
        stdout: string,
        stderr: string,
      ) => void
      callback(null, 'ok', '')
    }) as never)
    expect(
      await run('git', ['ls-remote', '--tags', 'x'], { cwd: '/' }),
    ).toEqual({ status: 0, stdout: 'ok', stderr: '' })
    expect(childProcess.execFile).toHaveBeenCalledWith(
      'git',
      ['ls-remote', '--tags', 'x'],
      expect.objectContaining({ maxBuffer: 64 * 1024 * 1024 }),
      expect.any(Function),
    )
  })
})

describe('runUpdate actions', () => {
  let dir: string
  const update = (dry = false): Promise<UpdateResult | undefined> =>
    runUpdate({ dir, dry, only: ['actions'] }).then((r) =>
      resultById(r.results, 'actions'),
    )
  beforeEach(() => {
    dir = tmpDir()
    mockTags({
      'actions/checkout': { v4: 'a', 'v4.2.0': 'a', v5: 'b', 'v5.0.1': 'b' },
      'github/codeql-action': { 'v3.1.0': 'c', 'v3.2.0': 'd' },
      'lzear/forge': { 'v5.0.0': 'e', 'v5.1.0': 'f' },
    })
    mockReleases({
      'actions/checkout': { 'v4.2.0': 90, 'v5.0.1': 10 },
      // v3.2.0 is younger than the age gate
      'github/codeql-action': { 'v3.1.0': 30, 'v3.2.0': 1 },
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('moves SHA pins to the newest release past the age gate', async () => {
    write(
      dir,
      '.github/workflows/ci.yml',
      [
        'jobs:',
        '  ci:',
        `    uses: lzear/forge/.github/workflows/ci.yml@${sha('e')} # v5.0.0`,
        '  build:',
        '    steps:',
        `      - uses: actions/checkout@${sha('a')} # v4.2.0`,
        `      - uses: github/codeql-action/init@${sha('c')} # v3.1.0`,
        `      - uses: actions/checkout@${sha('a')}`,
        '',
      ].join('\n'),
    )
    expect(await update()).toMatchObject({ pass: true, changed: true })
    expect(read(dir, '.github/workflows/ci.yml')).toBe(
      [
        'jobs:',
        '  ci:',
        `    uses: lzear/forge/.github/workflows/ci.yml@${sha('f')} # v5.1.0`,
        '  build:',
        '    steps:',
        `      - uses: actions/checkout@${sha('b')} # v5.0.1`,
        `      - uses: github/codeql-action/init@${sha('c')} # v3.1.0`,
        `      - uses: actions/checkout@${sha('b')} # v5.0.1`,
        '',
      ].join('\n'),
    )
    // own actions skip the gate, so their releases are not fetched
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps a version tag's precision, its quotes and comment", async () => {
    write(
      dir,
      'actions/setup/action.yml',
      [
        '    - uses: actions/checkout@v4',
        "    - uses: 'actions/checkout@v4.1' # pinned",
        '    - uses: actions/checkout@main',
        '    - uses: ./actions/local',
        '    - uses: docker://alpine:3',
        '',
      ].join('\n'),
    )
    const result = await update()
    expect(result?.detail).toBe(
      'actions/checkout v4  →  v5\nactions/checkout v4.1  →  v5.0.1',
    )
    expect(read(dir, 'actions/setup/action.yml')).toBe(
      [
        '    - uses: actions/checkout@v5',
        "    - uses: 'actions/checkout@v5.0.1' # pinned",
        '    - uses: actions/checkout@main',
        '    - uses: ./actions/local',
        '    - uses: docker://alpine:3',
        '',
      ].join('\n'),
    )
  })

  it('does not write in dry mode', async () => {
    const content = '- uses: actions/checkout@v4\n'
    write(dir, '.github/workflows/ci.yml', content)
    expect(await update(true)).toMatchObject({ changed: true })
    expect(read(dir, '.github/workflows/ci.yml')).toBe(content)
  })

  it('keeps pins it cannot date, failing on unreachable ones', async () => {
    write(
      dir,
      '.github/workflows/ci.yml',
      [
        '- uses: actions/checkout@v4',
        '- uses: gone/action@v1',
        '- uses: tags/only@v1',
        '',
      ].join('\n'),
    )
    mockTags({
      'actions/checkout': { v5: 'b' },
      'tags/only': { v1: 'a', v2: 'b' },
    })
    mockReleases({ 'actions/checkout': { v5: 10 }, 'tags/only': {} })
    const result = await update()
    expect(result).toMatchObject({ pass: false, changed: true })
    expect(result?.detail).toContain('gone/action: Error: tags unreachable')
    expect(result?.detail).toContain('tags/only: no releases to date, kept')
    expect(read(dir, '.github/workflows/ci.yml')).toContain(
      'actions/checkout@v5\n- uses: gone/action@v1\n- uses: tags/only@v1',
    )
  })

  it('reports no pins without a workflow', async () => {
    expect(await update()).toMatchObject({
      pass: true,
      changed: false,
      detail: 'no action pins',
    })
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })
})
