import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
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
    .filter((l) => l && SKIP_PREFIXES.every((p) => !l.slice(9).startsWith(p)))
    .join('\n')

// Depth-first search for the package.json of the package being released,
// skipping node_modules/dist/.git — packages are typically <5 dirs deep.
// eslint-disable-next-line sonarjs/cognitive-complexity
const findPackageJson = async (dir, name) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name.startsWith('.')
      )
        continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory())
        try {
          const found = await findPackageJson(full, name)
          if (found) return found
        } catch {
          // skip directories we can't traverse
        }
      else if (entry.name === 'package.json')
        try {
          const pkg = JSON.parse(await fs.readFile(full, 'utf8'))
          if (pkg.name === name) return full
        } catch {
          // not valid JSON, skip
        }
    }
  } catch {
    // skip unreadable directories
  }
}

const getRepoUrl = async () => {
  const package_ = JSON.parse(
    await fs.readFile(path.resolve(ROOT, 'package.json'), 'utf8'),
  )
  let repo = package_.repository
  if (!repo) return ''
  if (typeof repo === 'object') repo = repo.url
  repo = repo.replace(/^git\+/, '').replace(/\.git$/, '')
  if (!repo.includes('://'))
    repo = `https://github.com/${repo.replace(/^github:/, '')}`
  return repo
}

export const getReleaseLine = async (changeset, type) => {
  if (written.has(changeset.id)) return ''
  written.add(changeset.id)
  const packageName = changeset.releases[0]?.name
  const packageJsonPath = packageName
    ? await findPackageJson(ROOT, packageName)
    : undefined
  const package_ = JSON.parse(
    await fs.readFile(
      packageJsonPath ?? path.resolve(ROOT, 'package.json'),
      'utf8',
    ),
  )
  const version = bump(package_.version, type)
  const commits = filterCommits(getCommits())
  const repoUrl = await getRepoUrl()
  const commitSection = commits
    ? `### Commits\n\n${commits
        .split('\n')
        .map((l) => {
          const [sha, ...rest] = l.split(' ')
          const label = repoUrl
            ? `[\`${sha}\`](${repoUrl}/commit/${sha})`
            : `\`${sha}\``
          return `- ${label} ${rest.join(' ')}`
        })
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
