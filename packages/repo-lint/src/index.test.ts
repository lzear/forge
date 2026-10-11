import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import type { Check, LocalCheck, RemoteCheck } from './checks.ts'
import { checkLocal, detectRepo } from './index.ts'

const checks = vi.hoisted(() => ({
  local: [] as LocalCheck[],
  remote: [] as RemoteCheck[],
  ghProblem: null as string | null,
}))
vi.mock('./checks.ts', () => ({
  get CHECKS(): Check[] {
    return [...checks.local, ...checks.remote]
  },
  ghProblem: () => Promise.resolve(checks.ghProblem),
  get LOCAL_CHECKS(): LocalCheck[] {
    return checks.local
  },
  get REMOTE_CHECKS(): RemoteCheck[] {
    return checks.remote
  },
}))

const git = (cwd: string, ...arguments_: string[]): void => {
  execFileSync('git', arguments_, { cwd, stdio: 'ignore' })
}

const repoWithOrigin = (url: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-index-test-'))
  git(dir, 'init', '--quiet')
  git(dir, 'remote', 'add', 'origin', url)
  return dir
}

it('reads the repo from the origin of dir, not of the cwd', async () => {
  const dir = repoWithOrigin('git@github.com:a/b.git')
  expect(await checkLocal({ dir })).toEqual({
    repo: 'a/b',
    results: [],
    skipped: [],
  })
})

it("prefers the forge config's repo to origin", async () => {
  const dir = repoWithOrigin('git@github.com:a/legacy.git')
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ forge: { repo: 'a/current' } }),
  )
  expect(detectRepo(dir)).toBe('a/current')
  const report = await checkLocal({ dir })
  expect(report.repo).toBe('a/current')
  expect(report.results).toEqual([
    expect.objectContaining({ id: 'forge-config', pass: true }),
  ])
})

it('fails the config check on a malformed repo, falling back to origin', async () => {
  const dir = repoWithOrigin('git@github.com:a/b.git')
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ forge: { repo: 'nope' } }),
  )
  const report = await checkLocal({ dir })
  expect(report.repo).toBe('a/b')
  expect(report.results).toEqual([
    expect.objectContaining({
      id: 'forge-config',
      pass: false,
      detail: 'repo: expected "<owner>/<name>"',
    }),
  ])
})

it.each([
  'git@github.com:lzear/lzear.org.git',
  'https://github.com/lzear/lzear.org',
])('keeps dots in the repo name of %s', (url) => {
  expect(detectRepo(repoWithOrigin(url))).toBe('lzear/lzear.org')
})

// ── forge config & --only/--skip ─────────────────────────────────────────────

const passing = (id: string): LocalCheck => ({
  id,
  desc: `${id} desc`,
  type: 'local',
  check: () => true,
})

const withForge = (forge?: unknown): string => {
  checks.local = ['a', 'b', 'c'].map((id) => passing(id))
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-config-test-'))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(forge === undefined ? {} : { forge }),
  )
  return dir
}

const ids = (results: { id: string }[]): string[] => results.map((r) => r.id)

it('skips the checks the config names, with their reasons', async () => {
  const dir = withForge({ skip: { b: 'not needed' } })
  const report = await checkLocal({ dir, repo: 'x' })
  expect(ids(report.results)).toEqual(['forge-config', 'a', 'c'])
  expect(report.results[0]?.pass).toBe(true)
  expect(report.skipped).toEqual([
    { id: 'b', desc: 'b desc', skipped: 'not needed' },
  ])
})

it('adds no config result without a forge field', async () => {
  const report = await checkLocal({ dir: withForge(), repo: 'x' })
  expect(ids(report.results)).toEqual(['a', 'b', 'c'])
})

it.each([
  [{ skip: { b: ' ' } }, 'skip.b: reason required'],
  [{ skip: { b: 1 } }, 'skip.b: reason required'],
  [{ skip: { z: 'why' } }, 'skip.z: unknown check (valid: a, b, c)'],
  [{ skip: [] }, 'expected { "skip"'],
  ['nope', 'expected { "skip"'],
])(
  'fails the config check on %j, running every check',
  async (forge, detail) => {
    const report = await checkLocal({ dir: withForge(forge), repo: 'x' })
    expect(report.results[0]).toMatchObject({ id: 'forge-config', pass: false })
    expect(report.results[0]?.detail).toContain(detail)
    expect(ids(report.results)).toEqual(['forge-config', 'a', 'b', 'c'])
    expect(report.skipped).toEqual([])
  },
)

it('runs only the given checks, skipping others on --skip', async () => {
  const dir = withForge({ skip: { c: 'config' } })
  const report = await checkLocal({
    dir,
    repo: 'x',
    only: ['a', 'b', 'c'],
    skip: ['a'],
  })
  expect(ids(report.results)).toEqual(['forge-config', 'b'])
  expect(report.skipped).toEqual([
    { id: 'a', desc: 'a desc', skipped: '--skip' },
    { id: 'c', desc: 'c desc', skipped: 'config' },
  ])
  const onlyB = await checkLocal({ dir, repo: 'x', only: ['b'] })
  expect(ids(onlyB.results)).toEqual(['forge-config', 'b'])
  expect(onlyB.skipped).toEqual([])
})

it('throws on unknown ids in only or skip', async () => {
  const dir = withForge()
  await expect(checkLocal({ dir, only: ['a', 'zz'] })).rejects.toThrow(
    'Unknown check: zz (valid: a, b, c)',
  )
  await expect(checkLocal({ dir, skip: ['yy'] })).rejects.toThrow(
    'Unknown check: yy',
  )
})

// ── fix ──────────────────────────────────────────────────────────────────────

it('fixes failures in check order, then checks again', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-fix-test-'))
  const state = { a: false, b: false }
  const order: string[] = []
  checks.local = [
    {
      id: 'a',
      desc: 'a desc',
      type: 'local',
      check: () => state.a,
      fix: () => {
        order.push('a')
        state.a = true
        return 'a fixed'
      },
    },
    { ...passing('ok'), fix: vi.fn() },
    {
      id: 'b',
      desc: 'b desc',
      type: 'local',
      check: () => state.b,
      fix: () => {
        order.push('b')
        return Promise.reject(new Error('cannot'))
      },
    },
    { id: 'c', desc: 'c desc', type: 'local', check: () => false },
  ]
  const report = await checkLocal({ dir, repo: 'r', fix: true })
  expect(order).toEqual(['a', 'b'])
  expect(checks.local[1]?.fix).not.toHaveBeenCalled()
  expect(report.fixed).toEqual([
    { id: 'a', desc: 'a desc', pass: true, detail: 'a fixed' },
    { id: 'b', desc: 'b desc', pass: false, detail: 'cannot' },
  ])
  expect(report.results.map((r) => r.pass)).toEqual([true, true, false, false])
})

it('lists no fixes when nothing failed, and none without fix', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-fix-test-'))
  checks.local = [passing('a')]
  const report = await checkLocal({ dir, repo: 'r', fix: true })
  expect(report.fixed).toEqual([])
  expect(await checkLocal({ dir, repo: 'r' })).not.toHaveProperty('fixed')
})

// ── remote ───────────────────────────────────────────────────────────────────

const remote = (id: string, check: RemoteCheck['check']): RemoteCheck => ({
  id,
  desc: `${id} desc`,
  type: 'remote',
  check,
})

const remoteDir = (): string => {
  checks.local = []
  return mkdtempSync(path.join(tmpdir(), 'repo-lint-remote-test-'))
}

it('runs remote checks with the repo and dir, a throw failing one', async () => {
  const dir = remoteDir()
  const check = vi.fn(() => Promise.resolve({ pass: true, detail: 'ok' }))
  checks.remote = [
    remote('r1', check),
    remote('r2', () => Promise.reject(new Error('HTTP 403'))),
  ]
  const report = await checkLocal({ dir, repo: 'o/r' })
  expect(check).toHaveBeenCalledWith('o/r', dir)
  expect(report.results).toEqual([
    { id: 'r1', desc: 'r1 desc', pass: true, detail: 'ok' },
    { id: 'r2', desc: 'r2 desc', pass: false, detail: 'HTTP 403' },
  ])
})

it('fails once when gh cannot run, skipping on --skip-remote', async () => {
  const dir = remoteDir()
  const check = vi.fn(() => true)
  checks.remote = [remote('r1', check), remote('r2', check)]
  checks.ghProblem = 'gh not authenticated: gh auth login'
  const report = await checkLocal({ dir, repo: 'o/r' })
  expect(report.results).toEqual([
    {
      id: 'gh',
      desc: 'gh CLI for remote checks',
      pass: false,
      detail: 'gh not authenticated: gh auth login',
    },
  ])
  const skipped = await checkLocal({ dir, repo: 'o/r', skipRemote: true })
  expect(skipped.results).toEqual([])
  expect(check).not.toHaveBeenCalled()
  checks.ghProblem = null
  checks.remote = []
})

it('fails the remote checks once when no GitHub repo is known', async () => {
  const dir = remoteDir()
  const check = vi.fn(() => true)
  checks.remote = [remote('r1', check), remote('r2', check)]
  const report = await checkLocal({ dir })
  expect(report.repo).toBe(path.basename(dir))
  expect(report.results).toEqual([
    {
      id: 'gh',
      desc: 'gh CLI for remote checks',
      pass: false,
      detail: 'no GitHub repo: set forge.repo or a github.com origin',
    },
  ])
  expect(check).not.toHaveBeenCalled()
  checks.remote = []
})
