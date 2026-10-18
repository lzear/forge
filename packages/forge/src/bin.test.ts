import { stripVTControlCharacters } from 'node:util'
import * as clack from '@clack/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLocal,
  initRepo,
  type RepoReport,
  runUpdate,
  type SyncStatus,
  syncTemplates,
} from '@lzear/repo-lint'

vi.mock('@lzear/repo-lint', () => ({
  checkLocal: vi.fn(),
  initRepo: vi.fn(),
  runUpdate: vi.fn(),
  syncTemplates: vi.fn(),
  UPDATE_STEPS: ['deps', 'actions'],
}))
// vitest itself may run under an agent: pin it per test
const environment = vi.hoisted(() => ({ isAgent: false }))
vi.mock('std-env', () => environment)
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
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
  pass: passes.every(Boolean),
})

// a passing check and a drifted one; checkLocal fails it only when strict
const driftReport = (isStrict = false): RepoReport => ({
  repo: 'lzear/x',
  skipped: [],
  results: [
    { id: 'c0', desc: 'check 0', pass: true },
    { id: 'c1', desc: 'pins', pass: false, drift: true, detail: 'v4.10.0' },
  ],
  pass: !isStrict,
})

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
    next: ['gh secret set CODACY_PROJECT_TOKEN'],
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

  it('warns on drift, exiting 0', async () => {
    vi.mocked(checkLocal).mockResolvedValue(driftReport())
    expect(await run('check')).toBe(0)
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: false })
    expect(printed()).toMatch(/! {2}pins\n\s+v4\.10\.0/)
    expect(printed()).toContain('1/2 checks passed, 1 drifted')
  })

  it('shows drift to a coding agent', async () => {
    environment.isAgent = true
    vi.mocked(checkLocal).mockResolvedValue(driftReport())
    expect(await run('check')).toBe(0)
    expect(printed()).not.toContain('check 0')
    expect(printed()).toMatch(/! {2}pins\n\s+v4\.10\.0/)
  })

  it('--strict fails on drift', async () => {
    vi.mocked(checkLocal).mockResolvedValue(driftReport(true))
    expect(await run('check', '--strict')).toBe(1)
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: false, strict: true })
    expect(printed()).toContain('✗  pins')
    expect(printed()).not.toContain('drifted')
  })

  it('marks drift in JSON, passing unless strict', async () => {
    vi.mocked(checkLocal).mockResolvedValue(driftReport())
    expect(await run('check', '--json')).toBe(0)
    expect(json()).toMatchObject({
      results: [{ id: 'c0' }, { id: 'c1', pass: false, drift: true }],
      pass: true,
    })
  })

  it('fails on an unknown check id', async () => {
    vi.mocked(checkLocal).mockRejectedValue(new Error('Unknown check: zz'))
    expect(await run('check', '--only', 'zz')).toBe(1)
    expect(printed()).toContain('Unknown check: zz')
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

  it('passes --only and --skip through', async () => {
    vi.mocked(runUpdate).mockResolvedValue(updateReport(true) as never)
    expect(
      await run('update', '--only', 'deps,actions', '--skip', 'actions'),
    ).toBe(0)
    expect(runUpdate).toHaveBeenCalledWith({
      dry: false,
      install: true,
      only: ['deps', 'actions'],
      skip: ['actions'],
    })
  })

  it('exits 1 on an unknown step', async () => {
    vi.mocked(runUpdate).mockRejectedValue(new Error('Unknown step: nope'))
    expect(await run('update', '--skip', 'nope')).toBe(1)
    expect(printed()).toContain('Unknown step: nope')
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
    expect(await run('init', '--app', '--bun')).toBe(1)
    expect(initRepo).toHaveBeenCalledWith({
      kind: 'app',
      packageManager: 'bun',
      dry: false,
      version: expect.any(String),
    })
    expect(checkLocal).toHaveBeenCalledWith({ skipRemote: true })
    expect(printed()).toContain('tsconfig.json (created)')
    expect(printed()).toContain('package.json (updated)')
    expect(printed()).toContain('scripts: + qa')
    expect(printed()).toContain('LICENSE (exists)')
    expect(printed()).toContain('→  gh secret set CODACY_PROJECT_TOKEN')
    expect(printed()).toContain('1/2')
  })

  it('leaves the check to the user before install', async () => {
    mockInit(false)
    expect(await run('init')).toBeUndefined()
    expect(printed()).toContain('→  gh secret set CODACY_PROJECT_TOKEN')
    expect(checkLocal).not.toHaveBeenCalled()
  })

  it('previews on --dry, without checking', async () => {
    mockInit()
    expect(await run('init', '--dry')).toBeUndefined()
    expect(initRepo).toHaveBeenCalledWith({
      kind: 'lib',
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
