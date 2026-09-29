import * as childProcess from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execSync } = childProcess

// `changeset status --output=<file>` writes the fixture, git runs for real
const status: { current?: unknown } = {}
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof childProcess>()
  return {
    execSync: vi.fn((command: string, options: object) => {
      const output = /^changeset status --output=(.+)$/.exec(command)?.[1]
      if (!output) return original.execSync(command, options)
      writeFileSync(output, JSON.stringify(status.current))
      return Buffer.from('')
    }),
  }
})

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

const release = (version = '1.3.0', summaries = ['Summary.']): void => {
  const changesets = summaries.map((summary) => ({ summary }))
  status.current = {
    releases: version ? [{ name: '@x/a', newVersion: version }] : [],
    changesets,
  }
}

// runs the script like its bin does
const run = async (): Promise<void> => {
  vi.resetModules()
  await import('./changelog.mjs')
}

const changelog = (): string => readFileSync('CHANGELOG.md', 'utf8')

// each test runs in a fresh temp git repo
const cwd = process.cwd()

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'changelog-test-'))
  process.chdir(dir)
  git('init -q')
  git('config user.name test')
  git('config user.email test@example.com')
  git('config commit.gpgsign false')
  write('package.json', { name: 'root', version: '0.0.0' })
  release()
})

afterEach(() => {
  process.chdir(cwd)
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('lzear-changelog', () => {
  it('writes one section for all changesets, at the release version', async () => {
    commit('ci: only')
    release('2.0.0', ['First.', 'Second.\n'])
    await run()
    expect(changelog()).toBe('## 2.0.0\n\nFirst.\n\nSecond.\n\n')
  })

  it('prepends to the existing changelog', async () => {
    commit('ci: only')
    write('CHANGELOG.md', '## 1.2.3\n\nOlder.\n')
    await run()
    expect(changelog()).toBe('## 1.3.0\n\nSummary.\n\n## 1.2.3\n\nOlder.\n')
  })

  it('does nothing without releases', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    release('')
    await expect(run()).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('lists commits since the last v tag, minus skipped prefixes', async () => {
    commit('feat: before')
    git('tag v1')
    const sha = commit('fix: after')
    git('tag @x/a@1.0.0')
    commit('ci: noise')
    commit('chore: ncu')
    await run()
    expect(changelog()).toContain(`### Commits\n\n- \`${sha}\` fix: after\n\n`)
    expect(changelog()).not.toMatch(/before|noise|ncu/)
  })

  it.each([
    ['2.0.0', ['feat: beta', 'fix: rc']],
    ['2.0.0-rc.1', ['fix: rc']],
  ])(
    'lists commits for %s since the matching tag',
    async (version, subjects) => {
      commit('feat: stable')
      git('tag v1.0.0')
      commit('feat: beta')
      git('tag v2.0.0-beta.0')
      commit('fix: rc')
      release(version)
      await run()
      const listed = Array.from(
        changelog().matchAll(/^- `\w+` (.+)$/gm),
        (m) => m[1],
      )
      expect(listed).toEqual(subjects.toReversed())
    },
  )

  it('falls back to the last Version Packages commit', async () => {
    commit('feat: old')
    commit('Version Packages')
    const sha = commit('feat: new')
    await run()
    expect(changelog()).toContain(`- \`${sha}\` feat: new\n\n`)
    expect(changelog()).not.toContain('old')
  })

  it('takes the last 20 commits without tag or release', async () => {
    const sha = commit('feat: only')
    await run()
    expect(changelog()).toContain(`- \`${sha}\` feat: only`)
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
    await run()
    expect(changelog()).toContain(
      `- [\`${sha}\`](${url}/commit/${sha}) feat: a`,
    )
  })
})
