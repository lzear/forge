#!/usr/bin/env node

// Stages every unpublished workspace package on npm; a maintainer approves it
// with 2FA. Dry run unless --publish. --tag sets the npm dist-tag, which
// defaults to a prerelease's id (`rc` for 1.0.0-rc.2) and npm's `latest`
// otherwise. --release
// also creates the GitHub release, whose tag marks the version as done: a
// released version is skipped, even while its npm stage awaits approval.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { listWorkspaces } from './workspaces.mjs'

/**
@typedef {{ name: string, version: string, location: string }} Package
*/
/**
@typedef {{ tag: string, version: string, changelog: string | undefined, packages: Package[] }} Release
*/

const { values: options } = parseArgs({
  options: {
    publish: { type: 'boolean', default: false },
    release: { type: 'boolean', default: false },
    tag: { type: 'string' },
  },
})
const root = process.cwd()
const tarball = path.join(tmpdir(), 'lzear-publish.tgz')

/**
@param {string} command
*/
const run = (command) =>
  execSync(command, { cwd: root, stdio: 'pipe' }).toString().trim()

/**
@param {string} file
*/
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/**
@type {Package[]}
*/
const packages = listWorkspaces(root)
  .map(({ location }) => ({
    location,
    ...readJson(path.join(root, location, 'package.json')),
  }))
  .filter((p) => !p.private)

// a fixed group shares one `v<version>` release and the root changelog, other
// packages get `<name>@<version>` and their own changelog when they have one
const versions = new Set(packages.map((p) => p.version))
const fixed =
  packages.length > 1 && versions.size === 1 ? [...versions][0] : undefined
/**
@param {string} location
*/
const changelogOf = (location) =>
  [path.join(location, 'CHANGELOG.md'), 'CHANGELOG.md'].find((f) =>
    existsSync(path.join(root, f)),
  )
/**
@type {Release[]}
*/
const releases = fixed
  ? [
      {
        tag: `v${fixed}`,
        version: fixed,
        changelog: changelogOf('.'),
        packages,
      },
    ]
  : packages.map((p) => ({
      tag: `${p.name}@${p.version}`,
      version: p.version,
      changelog: changelogOf(p.location),
      packages: [p],
    }))

/**
@param {string} tag
*/
const isReleased = (tag) => {
  try {
    run(`gh release view "${tag}"`)
    return true
  } catch {
    return false
  }
}

/**
`1.0.0-rc.2` → `rc`, `1.0.0` → undefined
@param {string} version
*/
const prereleaseOf = (version) => {
  const pre = version.split('-', 2)[1]
  return pre && (/^[a-z]+/i.exec(pre)?.[0] ?? 'next')
}

/**
@param {Pick<Package, 'name' | 'version'>} package_
*/
const isPublished = ({ name, version }) => {
  try {
    return run(`npm view "${name}@${version}" version`) === version
  } catch {
    return false
  }
}

/**
@param {Package} package_
*/
const stage = ({ name, version }) => {
  if (isPublished({ name, version })) {
    console.log(`${name}@${version} already published, skipping`)
    return
  }
  if (!options.publish) {
    console.log(`[dry-run] would stage ${name}@${version}`)
    return
  }
  console.log(`Staging ${name}@${version}...`)
  const tag = options.tag ?? prereleaseOf(version)
  const distTag = tag ? ` --tag ${tag}` : ''
  execSync(`yarn workspace "${name}" pack --out ${tarball}`, {
    cwd: root,
    stdio: 'inherit',
  })
  execSync(`npm stage publish ${tarball} --access public${distTag}`, {
    cwd: root,
    stdio: 'inherit',
  })
}

/**
the changelog section under `## <version>`, without its heading
@param {Release} release
*/
const notesOf = ({ changelog, version }) => {
  const text = changelog ? readFileSync(path.join(root, changelog), 'utf8') : ''
  const section = text.split(/^## /m).find((s) => s.startsWith(`${version}\n`))
  return section ? section.slice(version.length + 1).trim() : ''
}

/**
@param {Release} release
*/
const createRelease = (release) => {
  if (!options.publish) {
    console.log(`[dry-run] would release ${release.tag}`)
    return
  }
  const notes = path.join(tmpdir(), 'lzear-publish-notes.md')
  writeFileSync(notes, notesOf(release))
  const sha = run('git rev-parse HEAD')
  const flag = prereleaseOf(release.version) ? ' --prerelease' : ''
  run(
    `gh release create "${release.tag}" --title "${release.tag}" --target ${sha} --notes-file ${notes}${flag}`,
  )
  console.log(`Released ${release.tag}`)
}

for (const release of releases) {
  if (options.release && isReleased(release.tag)) {
    console.log(`${release.tag} already released, skipping`)
    continue
  }
  for (const p of release.packages) stage(p)
  if (options.release) createRelease(release)
}
