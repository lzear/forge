import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'
import * as clack from '@clack/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLocal,
  detectRepo,
  initRepo,
  listSecrets,
  type RepoReport,
  runUpdate,
  type SyncStatus,
  syncTemplates,
} from '@lzear/repo-lint'

vi.mock('@lzear/repo-lint', () => ({
  checkLocal: vi.fn(),
  detectRepo: vi.fn(),
  initRepo: vi.fn(),
  listSecrets: vi.fn(),
  runUpdate: vi.fn(),
  syncTemplates: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
// vitest itself may run under an agent: pin it per test
const environment = vi.hoisted(() => ({ isAgent: false }))
vi.mock('std-env', () => environment)
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
  readonly code: number | undefined

  constructor(code: number | undefined) {
    super(`exit ${code}`)
    this.code = code
  }
}

// runs the CLI with the given args, resolving to its exit code
const run = async (...arguments_: string[]): Promise<number | undefined> => {
  process.argv = ['node', 'forge', ...arguments_]
  vi.resetModules()
  try {
    await import('./bin.ts')
    return process.exitCode === undefined ? undefined : Number(process.exitCode)
  } catch (error) {
    if (error instanceof ExitError) return error.code
    throw error
  } finally {
    // the test run's own exit code
    process.exitCode = undefined
  }
}

// everything written to stdout, stderr or the console, minus colors
const output: string[] = []
const capture = (chunk: unknown): boolean => {
  output.push(String(chunk))
  return true
}
const printed = (): string => stripVTControlCharacters(output.join('\n'))
const json = (): unknown => JSON.parse(printed())

const report = (...passes: boolean[]): RepoReport => ({
  repo: 'lzear/x',
  skipped: [],
  results: passes.map((pass, index) => ({
    id: `c${index}`,
    desc: `check ${index}`,
    pass,
    ...(!pass && { detail: 'why\nit failed' }),
  })),
})

const spawned = (status: number): SpawnSyncReturns<string> => ({
  status,
  stdout: '',
  stderr: '',
  pid: 0,
  output: [],
  signal: null,
})

// answers `detectRepo`, `listSecrets`, then `gh secret set`
const mockGh = ({ secrets = [] as string[] | null, set = 0 } = {}): void => {
  vi.mocked(detectRepo).mockReturnValue('lzear/x')
  vi.mocked(listSecrets).mockResolvedValue(secrets)
  vi.mocked(spawnSync).mockReturnValue(spawned(set))
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

const mockSync = (...statuses: SyncStatus[]): void => {
  vi.mocked(syncTemplates).mockResolvedValue({
    dir: '/r',
    results: statuses.map((status, index) => ({ file: `f${index}`, status })),
  })
}

const mockInit = (isInstalled = true): void => {
  vi.mocked(initRepo).mockResolvedValue({
    dir: '/r',
    results: [
      { file: 'tsconfig.json', status: 'created' },
      { file: 'package.json', status: 'updated', detail: 'scripts: + qa' },
      { file: 'LICENSE', status: 'unchanged' },
    ],
    next: ['forge setup'],
    isInstalled,
  })
}

const setTTY = (value: boolean | undefined): void => {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true })
}

const { argv } = process
const { isTTY } = process.stdout
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
  setTTY(isTTY)
  environment.isAgent = false
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
    expect(printed()).toContain('check 0')
    expect(printed()).toContain('check 1')
    expect(printed()).toContain('it failed')
    expect(printed()).toContain('1/2')
  })

  it('lists only failures to a coding agent', async () => {
    environment.isAgent = true
    vi.mocked(checkLocal).mockResolvedValue(report(true, false))
    expect(await run('check')).toBe(1)
    expect(printed()).not.toContain('check 0')
    expect(printed()).toContain('check 1')
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

  const skipped = { id: 's', desc: 'skipped check', skipped: 'why' }

  it('passes --only and --skip, counting skips in one line', async () => {
    vi.mocked(checkLocal).mockResolvedValue({
      ...report(true),
      skipped: [skipped, skipped],
    })
    expect(await run('check', '--only', 'a, b', '--skip', 'c')).toBe(0)
    expect(checkLocal).toHaveBeenCalledWith({
      skipRemote: false,
      only: ['a', 'b'],
      skip: ['c'],
    })
    expect(printed()).toContain('2 skipped')
    expect(printed()).not.toContain('skipped check')
  })

  it('hides the skip count from a coding agent', async () => {
    environment.isAgent = true
    vi.mocked(checkLocal).mockResolvedValue({
      ...report(true),
      skipped: [skipped],
    })
    expect(await run('check')).toBe(0)
    expect(printed()).not.toContain('skipped')
  })

  it('lists skipped checks in JSON', async () => {
    vi.mocked(checkLocal).mockResolvedValue({
      ...report(true),
      skipped: [skipped],
    })
    expect(await run('check', '--json')).toBe(0)
    expect(json()).toMatchObject({ skipped: [skipped], pass: true })
  })

  const fixed = [
    { id: 'f0', desc: 'fixed check', pass: true, detail: 'wrote x' },
    { id: 'f1', desc: 'stuck check', pass: false, detail: 'cannot' },
  ]

  it('--fix lists the fixes, then the checks', async () => {
    vi.mocked(checkLocal).mockResolvedValue({ ...report(true), fixed })
    expect(await run('check', '--fix')).toBe(0)
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: false, fix: true })
    expect(printed()).toMatch(/fixed check \(fixed\)\n\s+wrote x/)
    expect(printed()).toMatch(/stuck check \(fix failed\)\n\s+cannot/)
    expect(printed()).toContain('1/1')
  })

  it('--fix --json adds the fixed list', async () => {
    vi.mocked(checkLocal).mockResolvedValue({ ...report(false), fixed })
    expect(await run('check', '--fix', '--json')).toBe(1)
    expect(json()).toMatchObject({ fixed, pass: false })
  })

  it('fails on an unknown check id', async () => {
    vi.mocked(checkLocal).mockRejectedValue(new Error('Unknown check: zz'))
    expect(await run('check', '--only', 'zz')).toBe(1)
    expect(printed()).toContain('Unknown check: zz')
  })
})

// ── setup ────────────────────────────────────────────────────────────────────

describe('forge setup', () => {
  it('needs a repo', async () => {
    mockGh()
    vi.mocked(detectRepo).mockReturnValue(undefined)
    expect(await run('setup')).toBe(1)
    expect(printed()).toContain('Could not detect repo')
  })

  it('needs a working gh', async () => {
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
      ['secret', 'set', 'CODACY_PROJECT_TOKEN', '--repo', 'lzear/x'],
      {
        input: 'codacy-token',
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    )
    expect(clack.log.success).toHaveBeenCalledWith('CODACY_PROJECT_TOKEN set.')
    expect(clack.outro).toHaveBeenCalledWith(expect.stringContaining('Done.'))
  })

  it('reports a failed gh secret set', async () => {
    setTTY(true)
    mockGh({ set: 1 })
    vi.mocked(clack.password).mockResolvedValueOnce('codacy-token')
    expect(await run('setup')).toBeUndefined()
    expect(clack.log.error).toHaveBeenCalledWith(
      'CODACY_PROJECT_TOKEN not set: gh exited 1',
    )
    expect(clack.log.success).not.toHaveBeenCalledWith(
      'CODACY_PROJECT_TOKEN set.',
    )
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
  it('writes the bundled templates', async () => {
    mockSync('created', 'updated', 'unchanged')
    expect(await run('sync')).toBeUndefined()
    expect(syncTemplates).toHaveBeenCalledWith({ dry: false })
    expect(printed()).toContain('f0 (created)')
    expect(printed()).toContain('f1 (updated)')
    expect(printed()).toContain('f2 (unchanged)')
  })

  it('previews changes on --dry', async () => {
    mockSync('created', 'updated')
    expect(await run('sync', '--dry')).toBeUndefined()
    expect(syncTemplates).toHaveBeenCalledWith({ dry: true })
    expect(printed()).toContain('f0 (would create)')
    expect(printed()).toContain('f1 (would update)')
  })

  it('exits 1 on --check when a file drifted, writing nothing', async () => {
    mockSync('unchanged', 'updated')
    expect(await run('sync', '--check')).toBe(1)
    expect(syncTemplates).toHaveBeenCalledWith({ dry: true })
    expect(printed()).toContain('Run: forge sync')
  })

  it('exits 0 on --check when in sync', async () => {
    mockSync('unchanged')
    expect(await run('sync', '--check')).toBeUndefined()
  })

  it('exits 1 when a write fails', async () => {
    vi.mocked(syncTemplates).mockRejectedValue(new Error('EACCES'))
    expect(await run('sync')).toBe(1)
    expect(printed()).toContain('EACCES')
  })
})

describe('forge init', () => {
  it('writes the files and next steps, then checks without remote', async () => {
    mockInit()
    vi.mocked(checkLocal).mockResolvedValue(report(true, false))
    expect(await run('init', '--app', '--react', '--bun')).toBe(1)
    expect(initRepo).toHaveBeenCalledWith({
      kind: 'app',
      react: true,
      packageManager: 'bun',
      dry: false,
      version: expect.any(String),
    })
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: true })
    expect(printed()).toContain('tsconfig.json (created)')
    expect(printed()).toContain('package.json (updated)')
    expect(printed()).toContain('scripts: + qa')
    expect(printed()).toContain('LICENSE (exists)')
    expect(printed()).toContain('→  forge setup')
    expect(printed()).toContain('1/2')
  })

  it('leaves the check to the user before install', async () => {
    mockInit(false)
    expect(await run('init')).toBeUndefined()
    expect(printed()).toContain('→  forge setup')
    expect(checkLocal).not.toHaveBeenCalled()
  })

  it('previews on --dry, without checking', async () => {
    mockInit()
    expect(await run('init', '--dry')).toBeUndefined()
    expect(initRepo).toHaveBeenCalledWith({
      kind: 'lib',
      react: false,
      dry: true,
      version: expect.any(String),
    })
    expect(printed()).toContain('tsconfig.json (would create)')
    expect(checkLocal).not.toHaveBeenCalled()
  })

  it('rejects --app with --lib', async () => {
    expect(await run('init', '--app', '--lib')).toBe(1)
    expect(printed()).toContain("'--app' cannot be used with option '--lib'")
    expect(initRepo).not.toHaveBeenCalled()
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
