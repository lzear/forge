#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const publish = process.argv.includes('--publish')
const root = process.cwd()

const workspaces = execSync('yarn workspaces list --json', { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter(({ location }) => location !== '.')

for (const { location } of workspaces) {
  const pkg = JSON.parse(
    readFileSync(path.join(root, location, 'package.json'), 'utf8'),
  )
  if (pkg.private) continue

  const { name, version } = pkg

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
  execSync(`yarn workspace "${name}" pack --out /tmp/pkg.tgz`, {
    cwd: root,
    stdio: 'inherit',
  })
  execSync('npm publish /tmp/pkg.tgz --access public --provenance', {
    cwd: root,
    stdio: 'inherit',
  })
}
