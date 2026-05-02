const { promises: fs } = require('node:fs')
const path = require('node:path')

const ROOT_CHANGELOG = path.resolve(__dirname, '../CHANGELOG.md')
const written = new Set()

const bump = (version, type) => {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** @type {import("@changesets/types").ChangelogFunctions} */
module.exports = {
  getReleaseLine: async (changeset, type) => {
    if (written.has(changeset.id)) return ''
    written.add(changeset.id)
    const pkg = JSON.parse(
      await fs.readFile(
        path.resolve(__dirname, '../packages/forge/package.json'),
        'utf8',
      ),
    )
    const version = bump(pkg.version, type)
    const existing = await fs.readFile(ROOT_CHANGELOG, 'utf8').catch(() => '')
    await fs.writeFile(
      ROOT_CHANGELOG,
      `## ${version}\n\n- ${changeset.summary}\n\n${existing}`,
    )
    return ''
  },
  getDependencyReleaseLine: async () => '',
}
