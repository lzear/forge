import { execFileSync } from 'node:child_process'
import {
  existsSync,
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

const init = (dir: string, options: InitOptions = {}) =>
  initRepo({ dir, release, ...options })

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
    package_.devDependencies = Object.fromEntries(
      add
        .split(' ')
        .slice(3)
        .map((name) => [name, '*']),
    )
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(package_))

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
      expect.arrayContaining(['codacy', 'git-hooks', 'pkg-publint']),
    )
    expect(results.filter((r) => !r.pass)).toEqual([])
  })

  it('writes the files a Yarn library needs', async () => {
    const dir = repo()
    const { results, next } = await init(dir, { packageManager: 'yarn' })
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
      '.editorconfig',
      '.codacy.yml',
      'lefthook.yml',
      '.github/zizmor.yml',
    ])
    const name = path.basename(dir)
    expect(readJson(dir, 'package.json')).toMatchObject({
      name,
      version: '0.0.0',
      license: 'MIT',
      scripts: {
        build: 'tsdown',
        qa: 'yarn build && yarn typecheck && yarn lint && yarn test && yarn forge check',
        prepare: 'lefthook install',
      },
    })
    expect(readJson(dir, 'tsconfig.json').extends).toBe(
      '@lzear/forge/tsconfig/lib',
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
      expect.stringMatching(/^yarn add -D @lzear\/forge .* @changesets\/cli$/),
      'yarn changeset init',
      expect.stringContaining('CODACY_PROJECT_ID'),
      'forge setup (CODACY_PROJECT_TOKEN secret)',
      `npm trusted publisher: lzear/${name} / main.yml, once the package exists`,
    ])
  })

  it('writes a React app without release, LICENSE or badges', async () => {
    const dir = repo({ 'bun.lock': BUN_LOCK })
    const { results, next } = await init(dir, { kind: 'app', react: true })
    expect(results.map((r) => r.file)).not.toContain('LICENSE')
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
    expect(read(dir, 'bunfig.toml')).toBe(
      '[install]\nminimumReleaseAge = 259200\n',
    )
    expect(next[0]).toMatch(/ jsdom vite$/)
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
        '+ version, license\nscripts: + build, typecheck, lint, qa, prepare',
    })
    expect(readJson(dir, 'package.json')).toMatchObject({
      name: '@a/b',
      scripts: { test: 'node --test' },
    })
    expect(read(dir, 'LICENSE')).toContain(' Ada\n')
    expect(read(dir, 'README.md')).toContain('# @a/b\n')
    expect(next[0]).not.toContain('eslint')

    const again = await init(dir, { packageManager: 'yarn' })
    expect(again.results.every((r) => r.status === 'unchanged')).toBe(true)
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
