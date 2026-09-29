#!/usr/bin/env node

// Prepends the pending release to the root CHANGELOG.md. Runs before
// `changeset version` consumes the changesets: `changeset status` knows every
// summary and the final version, which is shared under a `fixed` group.

import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = process.cwd()
const changelogPath = path.join(root, 'CHANGELOG.md')

const run = (command) =>
  execSync(command, { cwd: root, stdio: 'pipe' }).toString().trim()

const readStatus = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'changelog-'))
  const file = path.join(dir, 'status.json')
  run(`changeset status --output=${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

// commits since the last release tag, else since the last Version Packages
// commit, else the last 20. A stable release skips prerelease tags, so it
// lists everything its betas and rcs shipped.
const getCommits = (version) => {
  const exclude = version.includes('-') ? '' : " --exclude 'v*-*'"
  let base
  try {
    base = run(`git describe --tags --abbrev=0 --match 'v*'${exclude}`)
  } catch {
    base = run('git log --format=%H --grep="^Version Packages$" -1')
  }
  const range = base ? `${base}..HEAD` : '-20'
  return run(`git log --oneline --no-merges ${range}`)
}

const SKIP_PREFIXES = [
  'ci:',
  'chore: ncu',
  'chore: add changeset',
  'chore: add root CHANGELOG',
  'Version Packages',
]

const filterCommits = (raw) =>
  raw.split('\n').filter((l) => {
    const subject = l.slice(l.indexOf(' ') + 1)
    return l && SKIP_PREFIXES.every((p) => !subject.startsWith(p))
  })

const getRepoUrl = () => {
  let repo = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).repository
  if (!repo) return ''
  if (typeof repo === 'object') repo = repo.url
  repo = repo.replace(/^git\+/, '').replace(/\.git$/, '')
  if (!repo.includes('://'))
    repo = `https://github.com/${repo.replace(/^github:/, '')}`
  return repo
}

const { releases, changesets } = readStatus()
if (releases.length === 0) process.exit(0)

const repoUrl = getRepoUrl()
const commits = filterCommits(getCommits(releases[0].newVersion)).map((l) => {
  const [sha, ...rest] = l.split(' ')
  const label = repoUrl
    ? `[\`${sha}\`](${repoUrl}/commit/${sha})`
    : `\`${sha}\``
  return `- ${label} ${rest.join(' ')}`
})

const section = [
  `## ${releases[0].newVersion}`,
  ...changesets.map((c) => c.summary.trim()),
  ...(commits.length > 0 ? ['### Commits', commits.join('\n')] : []),
].join('\n\n')

let existing = ''
try {
  existing = readFileSync(changelogPath, 'utf8')
} catch {
  // first release
}
writeFileSync(changelogPath, `${section}\n\n${existing}`)
