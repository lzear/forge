// Scaffolds `forge init`'s Yarn library and Bun app into temp dirs, with this
// workspace's packages packed and resolved in place of npm's, installs the dev
// deps it prints from the registry, then runs every printed command, each
// script and a second `forge init`, whose check must pass now. Not in qa: it
// installs from the network. A failing scaffold's dir is kept.

import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

type Scaffold = {
  name: string
  pm: 'bun' | 'yarn'
  flags: string[]
  package: Record<string, unknown>
}

const SCAFFOLDS: Scaffold[] = [
  // the package.json `npm init` leaves
  {
    name: 'lib-yarn',
    pm: 'yarn',
    flags: [],
    package: { name: 'demo', version: '0.0.0' },
  },
  {
    name: 'app-bun',
    pm: 'bun',
    flags: ['--app', '--bun'],
    package: {
      name: 'demo-app',
      // bun audit reports dev deps' low advisories: katex, via @eslint/markdown
      forge: { skip: { 'deps-audit': 'bun audit: low, dev only' } },
    },
  },
  {
    name: 'react-yarn',
    pm: 'yarn',
    flags: ['--app', '--react', '--yarn'],
    package: { name: 'demo-react' },
  },
]

const root = path.join(import.meta.dirname, '..')
const bin = path.join(root, 'packages/forge/dist/bin.js')
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }

const sh = (command: string, cwd: string): number => {
  process.stdout.write(`\n$ ${command}\n`)
  return (
    spawnSync(command, { cwd, env, shell: true, stdio: 'inherit' }).status ?? 1
  )
}

// the workspace's published packages, packed with `workspace:` ranges resolved
const pack = (dir: string): Record<string, string> => {
  const tarballs: Record<string, string> = {}
  for (const name of ['configs', 'eslint-config', 'forge', 'repo-lint']) {
    const out = path.join(dir, `${name}.tgz`)
    const status = sh(
      `yarn pack --out ${out}`,
      path.join(root, 'packages', name),
    )
    if (status !== 0) throw new Error(`yarn pack ${name} failed`)
    tarballs[`@lzear/${name}`] = `file:${out}`
  }
  return tarballs
}

// the first failing step, or null
const scaffold = (
  { pm, flags, package: package_ }: Scaffold,
  dir: string,
  tarballs: Record<string, string>,
): string | null => {
  mkdirSync(dir)
  // both managers read `resolutions`, which package-json/* leaves alone; an
  // empty `devDependencies` keeps `add` from appending it after them
  const seeded = { ...package_, devDependencies: {}, resolutions: tarballs }
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(seeded, null, 2)}\n`,
  )
  spawnSync('git', ['init', '--quiet'], { cwd: dir })

  const init = spawnSync(process.execPath, [bin, 'init', ...flags], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
  process.stdout.write(init.stdout + init.stderr)
  if (init.status !== 0) return 'forge init'
  const commands = stripVTControlCharacters(init.stdout)
    .split('\n')
    .map((line) => /^\s*→\s+((?:bun|yarn) .*)$/.exec(line)?.[1])
    // asks questions; qa needs none of its config
    .filter(
      (command) => command !== undefined && command !== 'yarn changeset init',
    )
  const run = pm === 'bun' ? 'bun run' : 'yarn'
  const steps = [
    ...commands,
    `${run} typecheck`,
    `${run} lint`,
    `${run} test`,
    `node ${bin} init ${flags.join(' ')}`,
  ]
  for (const step of steps) if (sh(step, dir) !== 0) return step
  const lockfile = readFileSync(
    path.join(dir, pm === 'bun' ? 'bun.lock' : 'yarn.lock'),
    'utf8',
  )
  const fromNpm = Object.entries(tarballs)
    .filter(([, tarball]) => !lockfile.includes(tarball.slice('file:'.length)))
    .map(([name]) => name)
  return fromNpm.length > 0 ? `${fromNpm.join(', ')} resolved from npm` : null
}

if (sh('yarn build', root) !== 0) throw new Error('yarn build failed')
const dir = mkdtempSync(path.join(tmpdir(), 'forge-init-e2e-'))
const tarballs = pack(path.join(dir, 'packs'))
const failures: string[] = []
// `yarn e2e:init <name>…` runs those only
const only = new Set(process.argv.slice(2))
const scaffolds =
  only.size > 0 ? SCAFFOLDS.filter((s) => only.has(s.name)) : SCAFFOLDS
for (const s of scaffolds) {
  const failed = scaffold(s, path.join(dir, s.name), tarballs)
  if (failed) failures.push(`${s.name}: ${failed} (${path.join(dir, s.name)})`)
}
if (failures.length > 0) throw new Error(`Failed:\n${failures.join('\n')}`)
rmSync(dir, { recursive: true })
process.stdout.write('\nAll scaffolds pass.\n')
