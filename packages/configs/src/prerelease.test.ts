import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listWorkspaces } from './workspaces.mjs'

vi.mock('./workspaces.mjs', () => ({ listWorkspaces: vi.fn() }))
vi.mock('node:child_process', () => ({ execSync: vi.fn() }))

// ── helpers ──────────────────────────────────────────────────────────────────

const write = (file: string, content: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(content))
}

// what git, changesets and npm answer; `packed` records each version as packed
const state = {
  dirty: false,
  releases: [] as { name: string; type: string; newVersion: string }[],
  npm: new Map<string, string[]>(),
  packed: [] as string[],
}

const answers: [RegExp, (match: string[]) => string][] = [
  [/^git status --porcelain$/, () => (state.dirty ? ' M x' : '')],
  [
    /^changeset status --output=(\S+)$/,
    ([, file = '']) => {
      write(file, { releases: state.releases, changesets: [] })
      return ''
    },
  ],
  [
    /^npm view "(\S+)" versions --json$/,
    ([, name = '']) => {
      const versions = state.npm.get(name)
      if (!versions) throw new Error('E404')
      return JSON.stringify(versions.length === 1 ? versions[0] : versions)
    },
  ],
  [
    /^yarn workspace "(\S+)" pack/,
    ([, name = '']) => {
      const file = path.join(name, 'package.json')
      const { version } = JSON.parse(readFileSync(file, 'utf8'))
      state.packed.push(`${name}@${version}`)
      return ''
    },
  ],
]

const fakeExec = (command: string): ReturnType<typeof execSync> => {
  for (const [pattern, answer] of answers) {
    const match = pattern.exec(command)
    if (match) return Buffer.from(answer(match))
  }
  return Buffer.from('')
}

const commands = (): string[] =>
  vi.mocked(execSync).mock.calls.map(([command]) => command)

// runs the script like its bin does; fail() exits through a throw
const run = async (...arguments_: string[]): Promise<void> => {
  process.argv = ['node', 'lzear-prerelease', ...arguments_]
  vi.resetModules()
  await import('./prerelease.mjs')
}

const pkg = (name: string, version: string, newVersion?: string): void => {
  write(path.join(name, 'package.json'), { name, version })
  if (newVersion) state.releases.push({ name, type: 'minor', newVersion })
}

const setWorkspaces = (...names: string[]): void => {
  vi.mocked(listWorkspaces).mockReturnValue(
    names.map((name) => ({ name, location: name })),
  )
}

// each test runs in a fresh temp dir as the repo root
const logged: string[] = []
const errors: string[] = []
const { argv } = process
const cwd = process.cwd()

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prerelease-test-'))
  process.chdir(dir)
  Object.assign(state, {
    dirty: false,
    releases: [],
    npm: new Map(),
    packed: [],
  })
  logged.length = 0
  errors.length = 0
  vi.mocked(execSync).mockReset().mockImplementation(fakeExec)
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logged.push(String(line))
  })
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    errors.push(String(line))
  })
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('exit')
  })
})

afterEach(() => {
  process.argv = argv
  process.chdir(cwd)
  vi.restoreAllMocks()
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('lzear-prerelease', () => {
  it('publishes the next number under the prerelease tag, then restores', async () => {
    pkg('a', '3.0.0', '4.0.0')
    setWorkspaces('a')
    state.npm.set('a', [
      '3.0.0',
      '4.0.0-beta.0',
      '4.0.0-beta.1',
      '4.0.0-alpha.7',
    ])
    await run('beta', '--publish')
    expect(state.packed).toEqual(['a@4.0.0-beta.2'])
    expect(logged).toEqual(['Publishing a@4.0.0-beta.2...'])
    expect(commands()).toContainEqual(
      expect.stringMatching(/^npm publish \S+ --access public --tag beta$/),
    )
    expect(commands().at(-1)).toBe(
      `git checkout -- ${path.join('a', 'package.json')}`,
    )
  })

  it('starts at 0 for an unpublished package', async () => {
    pkg('a', '0.0.0', '0.1.0')
    setWorkspaces('a')
    await run('alpha')
    expect(state.packed).toEqual(['a@0.1.0-alpha.0'])
  })

  it('takes the base of a pre mode version', async () => {
    pkg('a', '4.0.0-beta.1', '4.0.0-beta.2')
    setWorkspaces('a')
    state.npm.set('a', ['4.0.0-beta.0'])
    await run('beta')
    expect(state.packed).toEqual(['a@4.0.0-beta.1'])
  })

  it('keeps a group on one number, skipping private packages', async () => {
    pkg('a', '1.0.0', '1.1.0')
    pkg('b', '1.0.0', '1.1.0')
    write('c/package.json', { name: 'c', version: '1.0.0', private: true })
    state.releases.push({ name: 'c', type: 'minor', newVersion: '1.1.0' })
    setWorkspaces('a', 'b', 'c')
    state.npm.set('b', ['1.1.0-beta.3'])
    await run('beta')
    expect(state.packed).toEqual(['a@1.1.0-beta.4', 'b@1.1.0-beta.4'])
  })

  it('dry-runs npm without --publish', async () => {
    pkg('a', '1.0.0', '1.0.1')
    setWorkspaces('a')
    await run('beta')
    expect(commands()).toContainEqual(
      expect.stringMatching(/^npm publish .* --tag beta --dry-run$/),
    )
  })

  it.each([
    [[], 'usage: lzear-prerelease <alpha|beta|…>'],
    [['Beta.1'], 'usage: lzear-prerelease <alpha|beta|…>'],
    [['beta'], 'no changesets to prerelease'],
  ])('fails on %j', async (arguments_, error) => {
    setWorkspaces()
    await expect(run(...arguments_)).rejects.toThrow('exit')
    expect(errors).toEqual([error])
    expect(commands().some((c) => c.startsWith('npm publish'))).toBe(false)
  })

  it('refuses a dirty tree', async () => {
    state.dirty = true
    setWorkspaces()
    await expect(run('beta')).rejects.toThrow('exit')
    expect(errors).toEqual(['commit or stash your changes first'])
  })

  it('restores package.json when publishing fails', async () => {
    pkg('a', '1.0.0', '1.1.0')
    setWorkspaces('a')
    vi.mocked(execSync).mockImplementation((command: string) => {
      if (command.startsWith('npm publish')) throw new Error('E403')
      return fakeExec(command)
    })
    await expect(run('beta')).rejects.toThrow('E403')
    expect(commands().at(-1)).toMatch(/^git checkout -- /)
  })
})
