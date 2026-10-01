import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { checkLocal } from './index.ts'

vi.mock('./checks.ts', () => ({
  CHECKS: [],
  hasPublishedPkg: () => false,
  LOCAL_CHECKS: [],
  REMOTE_CHECKS: [],
}))

const git = (cwd: string, ...arguments_: string[]): void => {
  execFileSync('git', arguments_, { cwd, stdio: 'ignore' })
}

it('reads the repo from the origin of dir, not of the cwd', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-index-test-'))
  git(dir, 'init', '--quiet')
  git(dir, 'remote', 'add', 'origin', 'git@github.com:a/b.git')
  expect(await checkLocal({ dir })).toEqual({ repo: 'a/b', results: [] })
})
