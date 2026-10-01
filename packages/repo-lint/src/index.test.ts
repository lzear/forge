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

it('reads the repo from the origin of dir, not of the cwd', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-index-test-'))
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:a/b.git'], {
    cwd: dir,
  })
  expect(await checkLocal({ dir })).toEqual({ repo: 'a/b', results: [] })
})
