#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { listWorkspaces } from './workspaces.mjs'

const publish = process.argv.includes('--publish')
const root = process.cwd()
const tarball = path.join(tmpdir(), 'lzear-publish.tgz')

const workspaces = listWorkspaces(root)

for (const { location } of workspaces) {
  const package_ = JSON.parse(
    readFileSync(path.join(root, location, 'package.json'), 'utf8'),
  )
  if (package_.private) continue

  const { name, version } = package_

  try {
    const published = execSync(
      `npm view "${name}@${version}" version 2>/dev/null`,
      { cwd: root },
    )
      .toString()
      .trim()
    if (published === version) {
      console.log(`${name}@${version} already published, skipping`)
      continue
    }
  } catch {
    // not yet published
  }

  if (!publish) {
    console.log(`[dry-run] would publish ${name}@${version}`)
    continue
  }

  console.log(`Publishing ${name}@${version}...`)
  execSync(`yarn workspace "${name}" pack --out ${tarball}`, {
    cwd: root,
    stdio: 'inherit',
  })
  execSync(`npm stage publish ${tarball} --access public`, {
    cwd: root,
    stdio: 'inherit',
  })
}
