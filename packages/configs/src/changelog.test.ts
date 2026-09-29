import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── helpers ──────────────────────────────────────────────────────────────────

const write = (file: string, content: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content),
  )
}

const git = (command: string): string =>
  execSync(`git ${command}`, { stdio: 'pipe' }).toString().trim()

const commit = (message: string): string => {
  git(`commit --allow-empty -q -m "${message}"`)
  return git('rev-parse --short HEAD')
}

// the changelog module reads the cwd on import, so load it per test
const releaseLine = async (
  type: 'major' | 'minor' | 'patch',
  releases: { name: string }[] = [{ name: '@x/a' }],
  id = 'c1',
): Promise<string> => {
  const { getReleaseLine } = await import('./changelog.mjs')
  return getReleaseLine({ id, summary: 'Summary.', releases }, type)
}

const changelog = (): string => readFileSync('CHANGELOG.md', 'utf8')

// each test runs in a fresh temp git repo
const cwd = process.cwd()

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'changelog-test-'))
  process.chdir(dir)
  vi.resetModules()
  git('init -q')
  git('config user.name test')
  git('config user.email test@example.com')
  git('config commit.gpgsign false')
  write('package.json', { name: 'root', version: '0.0.0' })
  write('packages/a/package.json', { name: '@x/a', version: '1.2.3' })
})

afterEach(() => {
  process.chdir(cwd)
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('getReleaseLine', () => {
  it.each([
    ['major', '2.0.0'],
    ['minor', '1.3.0'],
    ['patch', '1.2.4'],
  ] as const)('bumps %s to %s', async (type, version) => {
    commit('feat: a')
    expect(await releaseLine(type)).toBe('')
    expect(changelog()).toMatch(new RegExp(`^## ${version}\n\nSummary.\n\n`))
  })

  it('prepends to the existing changelog, once per changeset', async () => {
    commit('feat: a')
    write('CHANGELOG.md', '## 1.2.3\n\nOlder.\n')
    await releaseLine('patch')
    await releaseLine('patch')
    expect(changelog().match(/## 1\.2\.4/g)).toHaveLength(1)
    expect(changelog()).toContain('## 1.2.3\n\nOlder.\n')
  })

  it('skips node_modules, dist, dotfiles and unreadable package.json', async () => {
    write('node_modules/a/package.json', { name: '@x/a', version: '9.0.0' })
    write('dist/package.json', { name: '@x/a', version: '9.0.0' })
    write('.hidden/package.json', { name: '@x/a', version: '9.0.0' })
    write('broken/package.json', '{')
    commit('feat: a')
    await releaseLine('patch')
    expect(changelog()).toMatch(/^## 1\.2\.4/)
  })

  it('falls back to the root package.json', async () => {
    commit('feat: a')
    await releaseLine('minor', [{ name: '@x/unknown' }])
    await releaseLine('minor', [], 'c2')
    expect(changelog()).toMatch(/^## 0\.1\.0\n[\s\S]*## 0\.1\.0\n/)
  })

  it('lists commits since the last tag, minus skipped prefixes', async () => {
    commit('feat: before')
    git('tag v1')
    const sha = commit('fix: after')
    commit('ci: noise')
    commit('chore: ncu')
    await releaseLine('patch')
    expect(changelog()).toContain(`### Commits\n\n- \`${sha}\` fix: after\n\n`)
    expect(changelog()).not.toMatch(/before|noise|ncu/)
  })

  it('uses the last Version Packages commit when the tag is older', async () => {
    commit('feat: old')
    git('tag v1')
    commit('Version Packages')
    const sha = commit('feat: new')
    await releaseLine('patch')
    expect(changelog()).toContain(`- \`${sha}\` feat: new\n\n`)
    expect(changelog()).not.toContain('old')
  })

  it('takes the last 20 commits without tag or release', async () => {
    const sha = commit('feat: only')
    await releaseLine('patch')
    expect(changelog()).toContain(`- \`${sha}\` feat: only`)
  })

  it('omits the commit section when nothing is left', async () => {
    commit('ci: only')
    await releaseLine('patch')
    expect(changelog()).toBe('## 1.2.4\n\nSummary.\n\n')
  })

  it.each([
    ['github:lzear/forge', 'https://github.com/lzear/forge'],
    [
      { type: 'git', url: 'git+https://github.com/lzear/forge.git' },
      'https://github.com/lzear/forge',
    ],
    ['lzear/forge', 'https://github.com/lzear/forge'],
  ])('links commits to repository %j', async (repository, url) => {
    write('package.json', { name: 'root', version: '0.0.0', repository })
    const sha = commit('feat: a')
    await releaseLine('patch')
    expect(changelog()).toContain(
      `- [\`${sha}\`](${url}/commit/${sha}) feat: a`,
    )
  })
})

describe('getDependencyReleaseLine', () => {
  it('is empty', async () => {
    const { getDependencyReleaseLine } = await import('./changelog.mjs')
    expect(await getDependencyReleaseLine()).toBe('')
  })
})
