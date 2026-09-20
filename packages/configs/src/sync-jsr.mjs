#!/usr/bin/env node

// Generates each workspace's deno.json from its package.json + tsup entries:
// a package opts into JSR by having a deno.json at all, everything inside it
// is derived. --check fails instead of writing, for CI.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const isCheck = process.argv.includes('--check')
const root = process.cwd()

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const workspaces = execSync('yarn workspaces list --json', { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter(({ location }) => location !== '.')

// a workspace dep is publishable to JSR only if it opts in too
const isOnJsr = new Map(
  workspaces.map(({ name, location }) => [
    name,
    existsSync(path.join(root, location, 'deno.json')),
  ]),
)

// dist output ("./dist/commitlint.emoji.js") -> source ("./src/commitlint-emoji.ts")
const distToSource = async (dir) => {
  const configFile = path.join(dir, 'tsup.config.ts')
  if (!existsSync(configFile)) return {}
  const module_ = await import(pathToFileURL(configFile).href)
  const entries = [module_.default].flat().flatMap((c) => {
    const entry = c.entry ?? {}
    return Array.isArray(entry)
      ? entry.map((source) => [path.parse(source).name, source])
      : Object.entries(entry)
  })
  return Object.fromEntries(
    entries.map(([out, source]) => [`./dist/${out}.js`, `./${source}`]),
  )
}

// flattens the exports map to { subpath: target }, taking the default condition
const exportTargets = (exports_) => {
  const targets = {}
  const walk = (subpath, value) => {
    if (typeof value === 'string') targets[subpath] = value
    else if (value?.default) walk(subpath, value.default)
    else {
      const subpaths = Object.entries(value ?? {})
      for (const [key, sub] of subpaths) if (key.startsWith('.')) walk(key, sub)
    }
  }
  walk('.', exports_)
  return targets
}

// an export is publishable unless its sources reach a package that is not on JSR
const reachesOnlyJsr = (dir, source, seen = new Set()) => {
  const file = path.join(dir, source)
  if (seen.has(file) || !existsSync(file)) return true
  seen.add(file)
  const specifiers = readFileSync(file, 'utf8')
    .matchAll(/from '([^']+)'/g)
    .map((m) => m[1])
    .filter((specifier) => !specifier.startsWith('node:'))
    .toArray()
  return specifiers.every((specifier) =>
    specifier.startsWith('.')
      ? reachesOnlyJsr(
          dir,
          './' + path.join(path.dirname(source), specifier),
          seen,
        )
      : (isOnJsr.get(specifier.split('/').slice(0, 2).join('/')) ?? true),
  )
}

const hasTests = (dir) =>
  existsSync(path.join(dir, 'src')) &&
  readdirSync(path.join(dir, 'src')).some((f) => f.endsWith('.test.ts'))

const compare = (a, b) => a.localeCompare(b)
const sortKeys = (o) =>
  Object.fromEntries(Object.entries(o).toSorted(([a], [b]) => compare(a, b)))
const sorted = (set) => [...set].toSorted(compare)

const generate = async (location) => {
  const dir = path.join(root, location)
  const package_ = readJson(path.join(dir, 'package.json'))
  const sources = await distToSource(dir)

  const exports_ = {}
  const include = new Set(['README.md', 'package.json'])
  const exclude = new Set()

  const bins = Object.entries(
    typeof package_.bin === 'string'
      ? { bin: package_.bin }
      : (package_.bin ?? {}),
  ).map(([name, target]) => [`./${name}`, target])

  for (const [subpath, target] of [
    ...Object.entries(exportTargets(package_.exports)),
    ...bins,
  ]) {
    const source = sources[target]
    // non-TS targets (tsconfig JSON, .mjs) ship as plain files, not exports
    if (!source) {
      if (existsSync(path.join(dir, target)))
        include.add(target.replace('./', '').split('/', 1)[0])
      continue
    }
    include.add(source.replace('./', '').split('/', 1)[0])
    if (reachesOnlyJsr(dir, source)) exports_[subpath] = source
    else exclude.add(source.replace('./', ''))
  }

  if (hasTests(dir)) exclude.add('src/**/*.test.ts')

  return {
    name: package_.name,
    version: package_.version,
    license: package_.license,
    exports: sortKeys(exports_),
    publish: {
      include: sorted(include),
      ...(exclude.size > 0 && { exclude: sorted(exclude) }),
    },
  }
}

let isStale = false

for (const { location } of workspaces) {
  const denoPath = path.join(root, location, 'deno.json')
  if (!existsSync(denoPath)) continue

  const generated = JSON.stringify(await generate(location), null, 2) + '\n'
  if (generated === readFileSync(denoPath, 'utf8')) continue

  if (isCheck) {
    console.error(`${location}/deno.json is out of date`)
    isStale = true
    continue
  }
  writeFileSync(denoPath, generated)
  console.log(`Generated ${location}/deno.json`)
}

if (isStale) {
  console.error('run `yarn lzear-sync-jsr` and commit the result')
  process.exit(1)
}
