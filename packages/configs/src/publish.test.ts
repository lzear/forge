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
  writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content),
  )
}

// registry and GitHub state the fake npm and gh answer from
const live = new Set<string>()
const released = new Set<string>()
const notes = new Map<string, string>()

const fakeExec = (command: string): ReturnType<typeof execSync> => {
  const spec = /^npm view "(\S+)" version$/.exec(command)?.[1]
  if (spec) {
    if (!live.has(spec)) throw new Error('E404')
    return Buffer.from(spec.slice(spec.lastIndexOf('@') + 1))
  }
  const release = /^gh release view "(.+)"$/.exec(command)
  if (release && !released.has(release[1] ?? '')) throw new Error('not found')
  const create =
    /^gh release create "(.+)" --target \S+ --notes-file (\S+)$/.exec(command)
  if (create) notes.set(create[1] ?? '', readFileSync(create[2] ?? '', 'utf8'))
  return Buffer.from(command === 'git rev-parse HEAD' ? 'abc123' : '')
}

const commands = (): string[] =>
  vi.mocked(execSync).mock.calls.map(([command]) => command)

const staged = (): string[] =>
  commands().flatMap((c) => {
    const pack = /^yarn workspace "(.+)" pack/.exec(c)
    return pack ? [pack[1] ?? ''] : []
  })

// runs the script like its bin does
const run = async (...arguments_: string[]): Promise<void> => {
  process.argv = ['node', 'lzear-publish', ...arguments_]
  vi.resetModules()
  await import('./publish.mjs')
}

const pkg = (location: string, name: string, version: string): void => {
  write(path.join(location, 'package.json'), { name, version })
}

// console output, and each test runs in a fresh temp dir as the repo root
const logged: string[] = []
const { argv } = process
const cwd = process.cwd()

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'publish-test-'))
  process.chdir(dir)
  live.clear()
  released.clear()
  notes.clear()
  logged.length = 0
  vi.mocked(execSync).mockReset().mockImplementation(fakeExec)
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logged.push(String(line))
  })
})

afterEach(() => {
  process.argv = argv
  process.chdir(cwd)
  vi.restoreAllMocks()
})

const setWorkspaces = (...locations: string[]): void => {
  vi.mocked(listWorkspaces).mockReturnValue(
    locations.map((location) => ({ name: location, location })),
  )
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('lzear-publish', () => {
  it('dry-runs without --publish', async () => {
    pkg('a', 'a', '1.0.0')
    setWorkspaces('a')
    await run('--release')
    expect(staged()).toEqual([])
    expect(logged).toEqual([
      '[dry-run] would stage a@1.0.0',
      '[dry-run] would release a@1.0.0',
    ])
  })

  it('stages unpublished public packages only', async () => {
    pkg('a', 'a', '1.0.0')
    pkg('b', 'b', '2.0.0')
    write('c/package.json', { name: 'c', version: '1.0.0', private: true })
    live.add('b@2.0.0')
    setWorkspaces('a', 'b', 'c')
    await run('--publish')
    expect(staged()).toEqual(['a'])
    expect(commands()).toContainEqual(
      expect.stringMatching(/^npm stage publish \S+ --access public$/),
    )
    expect(commands().some((c) => c.startsWith('gh release'))).toBe(false)
  })

  it('passes the dist-tag to npm', async () => {
    pkg('a', 'a', '1.0.0-beta-1')
    setWorkspaces('a')
    await run('--publish', '--tag', 'beta')
    expect(commands()).toContainEqual(
      expect.stringMatching(
        /^npm stage publish \S+ --access public --tag beta$/,
      ),
    )
  })

  it('releases a single package from its own changelog', async () => {
    pkg('a', 'a', '1.1.0')
    write('a/CHANGELOG.md', '# a\n\n## 1.1.0\n\n- New.\n\n## 1.0.0\n\n- Old.\n')
    setWorkspaces('a')
    await run('--publish', '--release')
    expect(staged()).toEqual(['a'])
    expect(Object.fromEntries(notes)).toEqual({ 'a@1.1.0': '- New.' })
  })

  it('releases a fixed group once, as v<version>, from the root changelog', async () => {
    pkg('a', 'a', '4.5.0')
    pkg('b', 'b', '4.5.0')
    write('CHANGELOG.md', '## 4.5.0\n\nBoth.\n\n## 4.4.0\n\nOlder.\n')
    setWorkspaces('a', 'b')
    await run('--publish', '--release')
    expect(staged()).toEqual(['a', 'b'])
    expect(Object.fromEntries(notes)).toEqual({ 'v4.5.0': 'Both.' })
  })

  it('skips a released version, even if npm does not show it yet', async () => {
    pkg('a', 'a', '1.0.0')
    released.add('a@1.0.0')
    setWorkspaces('a')
    await run('--publish', '--release')
    expect(staged()).toEqual([])
    expect(logged).toEqual(['a@1.0.0 already released, skipping'])
  })

  it('releases with empty notes when the changelog lacks the version', async () => {
    pkg('a', 'a', '1.0.0')
    pkg('b', 'b', '2.0.0')
    setWorkspaces('a', 'b')
    await run('--publish', '--release')
    expect(Object.fromEntries(notes)).toEqual({ 'a@1.0.0': '', 'b@2.0.0': '' })
  })
})
