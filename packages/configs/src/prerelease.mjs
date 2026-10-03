#!/usr/bin/env node

// Publishes the pending changesets as a prerelease, without committing:
// `lzear-prerelease beta` → `<next version>-beta.<N>` under dist-tag `beta`,
// N one past the highest on npm. npm asks for 2FA; package.json files are
// restored afterwards. Dry run unless --publish.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { readStatus } from './changesets.mjs'
import { listWorkspaces } from './workspaces.mjs'

const { positionals, values: options } = parseArgs({
  allowPositionals: true,
  options: { publish: { type: 'boolean', default: false } },
})
const [id] = positionals
const root = process.cwd()
const tarball = path.join(tmpdir(), 'lzear-prerelease.tgz')

/**
 * @param {string} command
 */
const run = (command) =>
  execSync(command, { cwd: root, stdio: 'pipe' }).toString().trim()

/**
 * @param {string} command
 */
const show = (command) => execSync(command, { cwd: root, stdio: 'inherit' })

/**
 * @param {string} message
 */
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

/**
 * N of every `<prefix><N>` version of the package on npm
 * @param {string} name
 * @param {string} prefix
 * @returns {number[]}
 */
const takenNumbers = (name, prefix) => {
  let versions
  try {
    versions = [JSON.parse(run(`npm view "${name}" versions --json`))].flat()
  } catch {
    return []
  }
  return versions.flatMap((/** @type {string} */ v) => {
    const n = v.startsWith(prefix) ? v.slice(prefix.length) : ''
    return /^\d+$/.test(n) ? [Number(n)] : []
  })
}

if (!id || !/^[a-z]+$/.test(id)) fail('usage: lzear-prerelease <alpha|beta|…>')
if (run('git status --porcelain')) fail('commit or stash your changes first')

const locations = new Map(
  listWorkspaces(root).map(({ name, location }) => [name, location]),
)
const packages = readStatus(root)
  .releases.filter((r) => r.type !== 'none' && locations.has(r.name))
  .map(({ name, newVersion }) => {
    const file = path.join(locations.get(name) ?? '', 'package.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    // in changesets pre mode, newVersion is itself a prerelease
    return { name, file, manifest, base: newVersion.split('-', 1)[0] }
  })
  .filter((p) => !p.manifest.private)
if (packages.length === 0) fail('no changesets to prerelease')

// one N for all, so a fixed group stays in step
const n =
  Math.max(
    -1,
    ...packages.flatMap(({ name, base }) =>
      takenNumbers(name, `${base}-${id}.`),
    ),
  ) + 1
const releases = packages.map((p) => ({
  ...p,
  version: `${p.base}-${id}.${n}`,
}))
const dryRun = options.publish ? '' : ' --dry-run'
try {
  for (const { file, manifest, version } of releases)
    writeFileSync(
      file,
      `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
    )
  show('yarn build')
  for (const { name, version } of releases) {
    console.log(`Publishing ${name}@${version}...`)
    show(`yarn workspace "${name}" pack --out ${tarball}`)
    show(`npm publish ${tarball} --access public --tag ${id}${dryRun}`)
  }
} finally {
  run(`git checkout -- ${packages.map((p) => p.file).join(' ')}`)
}
