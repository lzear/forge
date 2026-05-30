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
    return execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, {
      cwd: ROOT,
    })
      .toString()
      .trim()
  } catch {
    return execSync('git log --oneline --no-merges -20', { cwd: ROOT })
      .toString()
      .trim()
  }
}

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
  const commits = getCommits()
  const commitSection = commits
    ? `### Commits\n\n${commits
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n')}\n\n`
    : ''
  const existing = await fs.readFile(ROOT_CHANGELOG, 'utf8').catch(() => '')
  await fs.writeFile(
    ROOT_CHANGELOG,
    `## ${version}\n\n- ${changeset.summary}\n\n${commitSection}${existing}`,
  )
  return ''
}

export const getDependencyReleaseLine = async () => ''
