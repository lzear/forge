import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLocal } from './index.ts'
import { type InitOptions, initRepo } from './init.ts'
import { detectPackageManager } from './update.ts'

const sha = 'a'.repeat(40)
const release = { tag: 'v4.10.0', sha }

// a git repo whose files exist already
const repo = (files: Record<string, string> = {}): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-init-test-'))
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
  for (const [file, content] of Object.entries(files))
    writeFileSync(path.join(dir, file), content)
  return dir
}

// the registry stays offline: no packageManager field unless given
const init = (dir: string, options: InitOptions = {}) =>
  initRepo({ dir, release, packageManagerField: null, ...options })

const read = (dir: string, file: string): string =>
  readFileSync(path.join(dir, file), 'utf8')

const readJson = (dir: string, file: string): Record<string, unknown> =>
  JSON.parse(read(dir, file)) as Record<string, unknown>

const FORGE_YARN = (
  JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { packageManager: string }
).packageManager

const BUN_LOCK = JSON.stringify({ lockfileVersion: 1, workspaces: { '': {} } })

const REACT_PACKAGE = JSON.stringify({ dependencies: { react: '^19' } })

// `yarn add -D 'a@^1' 'b@npm:c@^2'` → { a: '^1', b: 'npm:c@^2' }
const addedRanges = (add: string): Record<string, string> =>
  Object.fromEntries(
    add
      .matchAll(/'(@?[^@']+)@([^']+)'/g)
      .map(([, name = '', range = '']) => [name, range]),
  )

// the first next step of a fresh repo
const addCommand = async (options: InitOptions): Promise<string> => {
  const { next } = await init(repo(), options)
  return next[0] ?? ''
}

// forge's own dev dependencies, root and packages
const FORGE_RANGES = Object.assign(
  {},
  ...['../../..', '../../configs', '../../forge', '../../repo-lint'].map(
    (dir) =>
      (
        JSON.parse(
          readFileSync(new URL(`${dir}/package.json`, import.meta.url), 'utf8'),
        ) as { devDependencies: Record<string, string> }
      ).devDependencies,
  ),
) as Record<string, string>

describe('initRepo', () => {
  it('scaffolds a library that passes forge check, bar the network', async () => {
    // forge's own Yarn: corepack has it, offline
    const dir = repo({
      'package.json': JSON.stringify({ packageManager: FORGE_YARN }),
      'yarn.lock': '',
    })
    const { next } = await init(dir)
    const [add = ''] = next
    expect(add).toMatch(/^yarn add -D /)
    // what that leaves
    const package_ = readJson(dir, 'package.json')
    package_.devDependencies = addedRanges(add)
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(package_))
    // tsdown's output, which publint looks for
    mkdirSync(path.join(dir, 'dist'))
    for (const file of ['index.mjs', 'index.d.mts'])
      writeFileSync(path.join(dir, 'dist', file), 'export {}\n')

    const { results } = await checkLocal({
      dir,
      skipRemote: true,
      // the registry and forge's tags; attw packs the build, left to the user
      skip: [
        'deps-audit',
        'deps-deprecated',
        'deps-fresh',
        'forge-pins',
        'pkg-attw',
      ],
    })
    expect(results.map((r) => r.id)).toEqual(
      expect.arrayContaining(['git-hooks', 'pkg-publint']),
    )
    expect(results.filter((r) => !r.pass)).toEqual([])
  })

  it('writes the files a Yarn library needs', async () => {
    const dir = repo()
    const { results, next } = await init(dir, {
      packageManager: 'yarn',
      packageManagerField: 'yarn@4.10.3',
    })
    expect(results.every((r) => r.status === 'created')).toBe(true)
    expect(results.map((r) => r.file)).toEqual([
      'package.json',
      'tsconfig.json',
      'eslint.config.ts',
      'vitest.config.ts',
      'commitlint.config.ts',
      'renovate.json',
      '.github/workflows/main.yml',
      '.gitignore',
      'LICENSE',
      'README.md',
      '.yarnrc.yml',
      'src/index.ts',
      'src/index.test.ts',
      '.editorconfig',
      'lefthook.yml',
      '.github/zizmor.yml',
    ])
    const name = path.basename(dir)
    const package_ = readJson(dir, 'package.json')
    expect(package_).toMatchObject({
      name,
      version: '0.0.0',
      license: 'MIT',
      type: 'module',
      exports: {
        '.': { types: './dist/index.d.mts', default: './dist/index.mjs' },
      },
      files: ['dist'],
      engines: { node: '>=24' },
      sideEffects: false,
      packageManager: 'yarn@4.10.3',
      scripts: {
        build: 'tsdown',
        qa: 'yarn build && yarn typecheck && yarn lint && yarn test && yarn forge check',
        prepare: 'lefthook install',
      },
    })
    // package-json/sort-properties' order
    expect(Object.keys(package_)).toEqual([
      'name',
      'version',
      'description',
      'license',
      'type',
      'exports',
      'sideEffects',
      'engines',
      'packageManager',
      'scripts',
      'files',
      'keywords',
    ])
    expect(readJson(dir, 'tsconfig.json').extends).toBe(
      '@lzear/forge/tsconfig/lib',
    )
    expect(read(dir, 'src/index.test.ts')).toContain(
      "import { greet } from './index.ts'",
    )
    const workflow = read(dir, '.github/workflows/main.yml')
    expect(workflow).toContain(
      `uses: lzear/forge/.github/workflows/ci.yml@${sha} # v4.10.0`,
    )
    expect(workflow).toContain(
      `uses: lzear/forge/.github/workflows/release.yml@${sha} # v4.10.0`,
    )
    expect(workflow).toContain("coverage-command: 'yarn test --coverage'")
    expect(workflow).toContain('${{ secrets.CODACY_PROJECT_TOKEN }}')
    expect(read(dir, 'LICENSE')).toContain(
      `Copyright (c) ${new Date().getFullYear()} `,
    )
    expect(read(dir, 'README.md')).toContain(
      `https://img.shields.io/npm/v/${name}`,
    )
    expect(read(dir, '.yarnrc.yml')).toBe(
      'nodeLinker: node-modules\nnpmMinimalAgeGate: 3d\n',
    )
    expect(next).toEqual([
      expect.stringMatching(
        /^yarn add -D '@lzear\/forge@\^4' .* '@changesets\/cli@\^3'$/,
      ),
      'yarn changeset init',
      'package.json: replace the lorem ipsum description and keywords',
      'optional: add the repo on app.codacy.com, then `gh secret set CODACY_PROJECT_TOKEN`',
      `npm trusted publisher: lzear/${name} / main.yml, once the package exists`,
      'yarn build && yarn forge check --skip-remote',
    ])
  })

  it('writes a React app without release, LICENSE or badges', async () => {
    const dir = repo({ 'bun.lock': BUN_LOCK, 'package.json': REACT_PACKAGE })
    const { results, next } = await init(dir, { kind: 'app' })
    expect(results.map((r) => r.file)).not.toContain('LICENSE')
    expect(results.map((r) => r.file)).not.toContain('.codacy.yml')
    expect(readJson(dir, 'package.json')).toMatchObject({
      private: true,
      scripts: { build: 'vite build', qa: expect.stringMatching(/^bun run /) },
    })
    expect(readJson(dir, 'package.json').scripts).not.toHaveProperty('prepare')
    expect(readJson(dir, 'tsconfig.json').extends).toBe(
      '@lzear/forge/tsconfig/react',
    )
    expect(read(dir, 'vitest.config.ts')).toContain(
      "from '@lzear/forge/vitest/react'",
    )
    const workflow = read(dir, '.github/workflows/main.yml')
    expect(workflow).not.toContain('release')
    expect(workflow).toMatch(/coverage-command: 'bun run test --coverage'\n$/)
    expect(read(dir, 'README.md')).toBe(`# ${path.basename(dir)}\n`)
    expect(next).toContain(
      'registry unreachable: set packageManager to bun@<version>',
    )
    expect(read(dir, 'bunfig.toml')).toBe(
      '[install]\nminimumReleaseAge = 259200\n',
    )
    expect(next[0]).toMatch(/ 'vite@\^8' 'jsdom@~30'$/)
    expect(read(dir, 'index.html')).toContain('src="/src/index.ts"')
    expect(next.at(-1)).toBe(
      'bun run build && bun run forge check --skip-remote',
    )
  })

  it('never overwrites, adding only missing scripts and settings', async () => {
    const package_ = {
      name: '@a/b',
      author: 'Ada <ada@example.com>',
      scripts: { test: 'node --test' },
      devDependencies: { eslint: '^10' },
    }
    const dir = repo({
      'package.json': JSON.stringify(package_),
      'tsconfig.json': '{}',
      '.yarnrc.yml': 'npmMinimalAgeGate: 1d\n',
    })
    const { results, next } = await init(dir, { packageManager: 'yarn' })
    const status = Object.fromEntries(results.map((r) => [r.file, r]))
    expect(status['tsconfig.json']).toEqual({
      file: 'tsconfig.json',
      status: 'unchanged',
    })
    expect(read(dir, 'tsconfig.json')).toBe('{}')
    expect(status['.yarnrc.yml']?.status).toBe('unchanged')
    expect(status['package.json']).toEqual({
      file: 'package.json',
      status: 'updated',
      detail:
        '+ version, description, keywords, license, sideEffects, exports, files, type, engines\nscripts: + build, typecheck, lint, qa, prepare',
    })
    expect(readJson(dir, 'package.json')).toMatchObject({
      name: '@a/b',
      scripts: { test: 'node --test' },
    })
    expect(read(dir, 'LICENSE')).toContain(' Ada\n')
    expect(read(dir, 'README.md')).toContain('# @a/b\n')
    expect(next[0]).not.toContain('eslint@')

    const again = await init(dir, { packageManager: 'yarn' })
    expect(again.results.every((r) => r.status === 'unchanged')).toBe(true)
  })

  it('adds the ranges forge itself uses', async () => {
    const add = await addCommand({ packageManager: 'yarn' })
    const {
      '@lzear/forge': forge,
      '@lzear/configs': configs,
      ...ranges
    } = addedRanges(add)
    // TS 6 for typescript-eslint, TS 7's tsc; Vitest's peer, which Yarn skips
    expect(Object.keys(ranges)).toEqual(
      expect.arrayContaining(['typescript', '@typescript/native', 'vite']),
    )
    expect(ranges).toEqual(
      Object.fromEntries(
        Object.keys(ranges).map((name) => [name, FORGE_RANGES[name]]),
      ),
    )
    expect([forge, configs]).toEqual(['^4', '^4'])
  })

  it('ranges the forge packages to the running major, or minor below 1', async () => {
    expect(await addCommand({ version: '5.0.0', kind: 'app' })).toMatch(
      /^yarn add -D '@lzear\/forge@\^5' /,
    )
    expect(await addCommand({ version: '0.23.1', kind: 'app' })).toMatch(
      /^yarn add -D '@lzear\/forge@\^0\.23' /,
    )
  })

  it('checks only once the dev deps are installed', async () => {
    const dir = repo()
    const { next, isInstalled } = await init(dir, { kind: 'app' })
    expect(isInstalled).toBe(false)
    const package_ = readJson(dir, 'package.json')
    package_.devDependencies = addedRanges(next[0] ?? '')
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(package_))

    const listed = await init(dir, { kind: 'app' })
    expect(listed.isInstalled).toBe(false)
    expect(listed.next[0]).toBe('yarn install')
    mkdirSync(path.join(dir, 'node_modules'))
    const installed = await init(dir, { kind: 'app' })
    expect(installed.isInstalled).toBe(true)
    expect(installed.next.join('\n')).not.toContain('forge check')
  })

  it('leaves an existing src/ alone', async () => {
    const dir = repo({ 'package.json': REACT_PACKAGE })
    mkdirSync(path.join(dir, 'src'))
    const { results } = await init(dir, { kind: 'app' })
    expect(results.map((r) => r.file)).not.toContain('src/index.ts')
    expect(existsSync(path.join(dir, 'index.html'))).toBe(false)
  })

  it('records the manager, which forge check reads before install', async () => {
    const dir = repo()
    await init(dir, { packageManager: 'bun', packageManagerField: 'bun@1.3.0' })
    expect(detectPackageManager(dir)).toMatchObject({
      name: 'bun',
      source: 'packageManager',
    })
  })

  it('writes nothing on a dry run', async () => {
    const dir = repo()
    const { results } = await init(dir, { dry: true })
    expect(results.every((r) => r.status === 'created')).toBe(true)
    expect(readdirSync(dir)).toEqual(['.git'])
  })

  it('pins main when forge tags are unreachable', async () => {
    const dir = repo()
    const { next } = await init(dir, { release: null, kind: 'app' })
    expect(read(dir, '.github/workflows/main.yml')).toContain(
      'ci.yml@main # unpinned',
    )
    expect(next).toContain(
      'forge tags unreachable, workflows on @main: forge check --fix',
    )
    expect(existsSync(path.join(dir, 'LICENSE'))).toBe(false)
  })
})
