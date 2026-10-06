import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
the pending release, as `changeset status` computes it
@param {string} root
@returns {{ releases: { name: string, type: string, newVersion: string }[], changesets: { summary: string }[] }}
*/
export const readStatus = (root) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'changesets-'))
  const file = path.join(dir, 'status.json')
  execSync(`changeset status --output=${file}`, { cwd: root, stdio: 'pipe' })
  return JSON.parse(readFileSync(file, 'utf8'))
}
