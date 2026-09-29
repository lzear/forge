import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as clack from '@clack/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLocal,
  checkRepo,
  type RepoReport,
  runUpdate,
} from '@lzear/repo-lint'

vi.mock('@lzear/repo-lint', () => ({
  checkLocal: vi.fn(),
  checkRepo: vi.fn(),
  runUpdate: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
  password: vi.fn(),
  isCancel: (value: unknown) => typeof value === 'symbol',
  cancel: vi.fn(),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`)
  }
}

// runs the CLI with the given args, resolving to its exit code
const run = async (...arguments_: string[]): Promise<number | undefined> => {
  process.argv = ['node', 'forge', ...arguments_]
  vi.resetModules()
  try {
    await import('./bin.ts')
    return undefined
  } catch (error) {
    if (error instanceof ExitError) return error.code
    throw error
  }
}

// everything written to stdout, stderr or the console
const output: string[] = []
const capture = (chunk: unknown): boolean => {
  output.push(String(chunk))
  return true
}
const printed = (): string => output.join('\n')
const json = (): unknown => JSON.parse(printed())

const report = (...passes: boolean[]): RepoReport => ({
  repo: 'lzear/x',
  results: passes.map((pass, index) => ({
    id: `c${index}`,
    desc: `check ${index}`,
    pass,
    ...(!pass && { detail: 'why\nit failed' }),
  })),
})

const spawned = (status: number, stdout = ''): SpawnSyncReturns<string> => ({
  status,
  stdout,
  stderr: '',
  pid: 0,
  output: [],
  signal: null,
})

// answers `gh` calls: `git remote`, `gh --version`, then `gh secret list`
const mockGh = ({
  remote = 'git@github.com:lzear/x.git',
  gh = 0,
  secrets = [] as string[] | null,
} = {}): void => {
  vi.mocked(spawnSync).mockImplementation(((
    command: string,
    args: string[],
  ) => {
    if (command === 'git') return spawned(remote ? 0 : 1, remote)
    if (args[0] === '--version') return spawned(gh)
    if (args[0] === 'secret' && args[1] === 'list')
      return secrets
        ? spawned(0, JSON.stringify(secrets.map((name) => ({ name }))))
        : spawned(1)
    return spawned(0)
  }) as typeof spawnSync)
}

const updateReport = (pass: boolean) => ({
  dir: '/r',
  packageManager: { name: 'yarn', version: '4.0.0', source: 'lockfile' },
  results: [
    { id: 'a', desc: 'deps', pass: true, changed: true, detail: 'x ^1 → ^2' },
    { id: 'b', desc: 'node', pass: true, changed: false, detail: 'quiet' },
    { id: 'c', desc: 'install', pass, changed: false, detail: 'boom' },
  ],
})

const mockFetch = (ok = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 404,
        text: () => Promise.resolve(`from ${url}`),
      }),
    ),
  )
}

const setTTY = (value: boolean | undefined): void => {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true })
}

const { argv } = process
const { isTTY } = process.stdout
const cwd = process.cwd()
const signalListeners = new Set([
  ...process.listeners('SIGINT'),
  ...process.listeners('SIGTERM'),
])

beforeEach(() => {
  setTTY(undefined)
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitError(code as number | undefined)
  })
  output.length = 0
  vi.spyOn(process.stdout, 'write').mockImplementation(capture)
  vi.spyOn(process.stderr, 'write').mockImplementation(capture)
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
})

afterEach(() => {
  process.argv = argv
  process.chdir(cwd)
  setTTY(isTTY)
  vi.restoreAllMocks()
  vi.resetAllMocks()
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    for (const listener of process.listeners(signal))
      if (!signalListeners.has(listener)) process.off(signal, listener)
})

// ── check ────────────────────────────────────────────────────────────────────

describe('forge check', () => {
  it('reports local checks, with details of failures', async () => {
    vi.mocked(checkLocal).mockResolvedValue(report(true, false))
    expect(await run('check', '--skip-remote')).toBe(1)
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: true })
    expect(printed()).toContain('check 1')
    expect(printed()).toContain('it failed')
    expect(printed()).toContain('1/2')
  })

  it('exits 0 when every check passes', async () => {
    vi.mocked(checkLocal).mockResolvedValue(report(true))
    expect(await run('check')).toBe(0)
    expect(printed()).toContain('1/1')
  })

  it('prints JSON', async () => {
    vi.mocked(checkLocal).mockResolvedValue(report(true))
    expect(await run('check', '--json')).toBe(0)
    expect(json()).toMatchObject({ repo: 'lzear/x', pass: true })
  })

  it('checks remote repos and survives clone failures', async () => {
    vi.mocked(checkRepo)
      .mockResolvedValueOnce(report(true))
      .mockRejectedValueOnce(new Error('clone'))
    expect(
      await run('check', '--repos', 'lzear/a, lzear/b', '--dir', '/d'),
    ).toBe(1)
    expect(checkRepo).toHaveBeenCalledWith('lzear/b', {
      baseDir: '/d',
      skipRemote: false,
    })
    expect(printed()).toContain('lzear/b — could not clone')
  })

  it('exits 0 when every remote repo passes', async () => {
    vi.mocked(checkRepo).mockResolvedValue(report(true))
    expect(await run('check', '--repos', 'lzear/a', '--json')).toBe(0)
  })

  it('exits 1 when a remote repo fails', async () => {
    vi.mocked(checkRepo).mockResolvedValue(report(false))
    expect(await run('check', '--repos', 'lzear/a')).toBe(1)
  })
})

// ── setup ────────────────────────────────────────────────────────────────────

describe('forge setup', () => {
  it('needs a repo', async () => {
    mockGh({ remote: '' })
    expect(await run('setup')).toBe(1)
    expect(printed()).toContain('Could not detect repo')
  })

  it('needs gh', async () => {
    mockGh({ gh: 1 })
    expect(await run('setup')).toBe(1)
    expect(printed()).toContain('gh CLI not found')
  })

  it('needs gh auth', async () => {
    mockGh({ secrets: null })
    expect(await run('setup')).toBe(1)
    expect(printed()).toContain('gh auth login')
  })

  it('prints JSON, failing on missing secrets', async () => {
    mockGh({ secrets: ['OTHER'] })
    expect(await run('setup', '--json')).toBe(1)
    expect(json()).toEqual({
      repo: 'lzear/x',
      present: [],
      missing: ['CODACY_PROJECT_TOKEN'],
    })
  })

  it('is done when every secret is present', async () => {
    mockGh({ secrets: ['CODACY_PROJECT_TOKEN'] })
    expect(await run('setup', '--repo', 'lzear/y')).toBeUndefined()
    expect(printed()).toContain('forge setup · ')
    expect(printed()).toContain('All secrets present.')
  })

  it('does not prompt on --dry', async () => {
    mockGh()
    expect(await run('setup', '--dry')).toBeUndefined()
    expect(printed()).toContain('Dry run')
  })

  it('points to gh secret set outside a TTY', async () => {
    mockGh()
    expect(await run('setup')).toBeUndefined()
    expect(printed()).toContain(
      'gh secret set CODACY_PROJECT_TOKEN --repo lzear/x',
    )
    expect(clack.password).not.toHaveBeenCalled()
  })

  it('prompts for missing secrets in a TTY', async () => {
    setTTY(true)
    mockGh()
    vi.mocked(clack.password).mockResolvedValueOnce(' codacy-token ')
    expect(await run('setup')).toBeUndefined()
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      [
        'secret',
        'set',
        'CODACY_PROJECT_TOKEN',
        '--repo',
        'lzear/x',
        '--body',
        'codacy-token',
      ],
      { stdio: 'ignore' },
    )
    expect(clack.outro).toHaveBeenCalledWith(expect.stringContaining('Done.'))
  })

  it('skips a cancelled prompt', async () => {
    setTTY(true)
    mockGh()
    vi.mocked(clack.password).mockResolvedValueOnce(Symbol('cancel') as never)
    expect(await run('setup')).toBeUndefined()
    expect(clack.log.warn).toHaveBeenCalledWith('CODACY_PROJECT_TOKEN skipped.')
  })
})

// ── update ───────────────────────────────────────────────────────────────────

describe('forge update', () => {
  it('reports changes and failures', async () => {
    vi.mocked(runUpdate).mockResolvedValue(updateReport(false) as never)
    expect(await run('update', '--dry', '--no-install')).toBe(1)
    expect(runUpdate).toHaveBeenCalledWith({ dry: true, install: false })
    expect(printed()).toContain('(dry run)')
    expect(printed()).toContain('yarn@4.0.0 (lockfile)')
    expect(printed()).toContain('x ^1 → ^2')
    expect(printed()).toContain('boom')
    expect(printed()).not.toContain('quiet')
  })

  it('prints JSON', async () => {
    vi.mocked(runUpdate).mockResolvedValue({
      ...updateReport(true),
      packageManager: { name: 'npm', source: 'default' },
    } as never)
    expect(await run('update', '--json')).toBe(0)
    expect(runUpdate).toHaveBeenCalledWith({ dry: false, install: true })
    expect(json()).toMatchObject({ pass: true })
  })
})

// ── sync ─────────────────────────────────────────────────────────────────────

describe('forge sync', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'forge-sync-test-'))
    process.chdir(dir)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes the shared files', async () => {
    mockFetch()
    expect(await run('sync')).toBeUndefined()
    expect(readFileSync(path.join(dir, '.github/zizmor.yml'), 'utf8')).toBe(
      'from https://raw.githubusercontent.com/lzear/forge/main/.github/zizmor.yml',
    )
    expect(existsSync(path.join(dir, 'lefthook.yml'))).toBe(true)
  })

  it('writes nothing on --dry', async () => {
    mockFetch()
    expect(await run('sync', '--dry')).toBeUndefined()
    expect(existsSync(path.join(dir, 'lefthook.yml'))).toBe(false)
    expect(printed()).toContain('(dry)')
  })

  it('exits 1 when a fetch fails', async () => {
    mockFetch(false)
    expect(await run('sync')).toBe(1)
    expect(printed()).toContain('HTTP 404')
  })
})

// ── signals ──────────────────────────────────────────────────────────────────

describe('signals', () => {
  it('exits 130 on SIGINT', async () => {
    vi.mocked(checkLocal).mockResolvedValue(report(true))
    setTTY(true)
    await run('check')
    const handler = process
      .listeners('SIGINT')
      .find((l) => !signalListeners.has(l))
    expect(() => handler?.('SIGINT')).toThrow('exit 130')
    expect(clack.cancel).toHaveBeenCalledWith('Cancelled.')
  })
})
