import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const ROOT_CHANGELOG = path.resolve(ROOT, 'CHANGELOG.md')
const written = new Set()

const bump = (version, type) => {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const getCommits = () => {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', { cwd: ROOT })
      .toString()
      .trim()
    const commits = execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, {
      cwd: ROOT,
    })
      .toString()
      .trim()
    // If commits include a "Version Packages" entry, the tag predates a prior
    // release cycle — fall through to the Version Packages baseline instead.
    if (!commits.includes('Version Packages')) return commits
  } catch {
    // tag lookup failed, fall through
  }
  try {
    const base = execSync(
      'git log --oneline --format=%H --grep="^Version Packages$" -1',
      { cwd: ROOT },
    )
      .toString()
      .trim()
    if (base)
      return execSync(`git log ${base}..HEAD --oneline --no-merges`, {
        cwd: ROOT,
      })
        .toString()
        .trim()
  } catch {
    // no Version Packages commit found
  }
  return execSync('git log --oneline --no-merges -20', { cwd: ROOT })
    .toString()
    .trim()
}

const SKIP_PREFIXES = [
  'ci:',
  'chore: ncu',
  'chore: add changeset',
  'chore: add root CHANGELOG',
  'Version Packages',
]

const filterCommits = (raw) =>
  raw
    .split('\n')
    .filter((l) => l && !SKIP_PREFIXES.some((p) => l.slice(9).startsWith(p)))
    .join('\n')

export const getReleaseLine = async (changeset, type) => {
  if (written.has(changeset.id)) return ''
  written.add(changeset.id)
  const pkg = JSON.parse(
    await fs.readFile(
      path.resolve(ROOT, 'packages/forge/package.json'),
      'utf8',
    ),
  )
  const version = bump(pkg.version, type)
  const commits = filterCommits(getCommits())
  const commitSection = commits
    ? `### Commits\n\n${commits
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n')}\n\n`
    : ''
  const existing = await fs.readFile(ROOT_CHANGELOG, 'utf8').catch(() => '')
  await fs.writeFile(
    ROOT_CHANGELOG,
    `## ${version}\n\n${changeset.summary}\n\n${commitSection}${existing}`,
  )
  return ''
}

export const getDependencyReleaseLine = async () => ''
