import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listWorkspaces } from './workspaces.mjs'

vi.mock('./workspaces.mjs', () => ({ listWorkspaces: vi.fn() }))

// ── helpers ──────────────────────────────────────────────────────────────────

class ExitError extends Error {
  readonly code: number | undefined

  constructor(code: number | undefined) {
    super(`exit ${code}`)
    this.code = code
  }
}

const write = (dir: string, file: string, content: unknown): void => {
  const full = path.join(dir, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(
    full,
    typeof content === 'string' ? content : JSON.stringify(content),
  )
}

const readDeno = (location: string): unknown =>
  JSON.parse(readFileSync(path.join(location, 'deno.json'), 'utf8'))

// runs the script like its bin does, resolving to the exit code
const run = async (...arguments_: string[]): Promise<number | undefined> => {
  process.argv = ['node', 'lzear-sync-jsr', ...arguments_]
  vi.resetModules()
  try {
    await import('./sync-jsr.mjs')
    return undefined
  } catch (error) {
    if (error instanceof ExitError) return error.code
    throw error
  }
}

// console output, and each test runs in a fresh temp dir as the repo root
const logged: string[] = []
const capture = (line: unknown): void => {
  logged.push(String(line))
}
const { argv } = process
const cwd = process.cwd()

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sync-jsr-test-'))
  process.chdir(dir)
  logged.length = 0
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitError(code as number | undefined)
  })
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
})

afterEach(() => {
  process.argv = argv
  process.chdir(cwd)
  vi.restoreAllMocks()
})

// ── fixtures ─────────────────────────────────────────────────────────────────

const setWorkspaces = (...locations: [name: string, location: string][]) => {
  vi.mocked(listWorkspaces).mockReturnValue(
    locations.map(([name, location]) => ({ name, location })),
  )
}

const lib = (dir = 'packages/lib'): void => {
  write(dir, 'package.json', {
    name: '@x/lib',
    version: '1.2.3',
    license: 'MIT',
    bin: './dist/bin.js',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './nested': { default: { default: './dist/nested.js' } },
      './tsconfig': './tsconfig/base.json',
      './off-jsr': './dist/off-jsr.js',
      './missing': './missing.json',
    },
  })
  write(
    dir,
    'tsup.config.ts',
    `export default [
      { entry: { index: 'src/index.ts', bin: 'src/bin.ts' } },
      { entry: ['src/nested.ts', 'src/off-jsr.ts'] },
    ]`,
  )
  write(dir, 'src/index.ts', "import { a } from './a.ts'\nimport 'node:fs'")
  write(dir, 'src/a.ts', "import { b } from './index.ts'")
  write(dir, 'src/bin.ts', "import { c } from '@x/jsr/sub'")
  write(dir, 'src/nested.ts', '')
  write(dir, 'src/off-jsr.ts', "import { d } from '@x/npm-only'")
  write(dir, 'src/sub/index.test.ts', '')
  write(dir, 'tsconfig/base.json', '{}')
  write(dir, 'deno.json', {})
}

const jsrDep = (): void => {
  write('.', 'packages/jsr/package.json', { name: '@x/jsr', version: '1.0.0' })
  write('.', 'packages/jsr/deno.json', {})
  write('.', 'packages/npm/package.json', { name: '@x/npm-only' })
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('sync-jsr', () => {
  it('derives deno.json from package.json and tsup entries', async () => {
    lib()
    jsrDep()
    setWorkspaces(
      ['@x/lib', 'packages/lib'],
      ['@x/jsr', 'packages/jsr'],
      ['@x/npm-only', 'packages/npm'],
    )

    expect(await run()).toBeUndefined()

    expect(readDeno('packages/lib')).toEqual({
      name: '@x/lib',
      version: '1.2.3',
      license: 'MIT',
      exports: {
        '.': './src/index.ts',
        './bin': './src/bin.ts',
        './nested': './src/nested.ts',
      },
      publish: {
        include: ['package.json', 'README.md', 'src', 'tsconfig'],
        exclude: ['src/**/*.test.ts', 'src/off-jsr.ts'],
      },
    })
    expect(readDeno('packages/jsr')).toEqual({
      name: '@x/jsr',
      version: '1.0.0',
      exports: {},
      publish: { include: ['package.json', 'README.md'] },
    })
  })

  it('skips workspaces without a deno.json', async () => {
    jsrDep()
    setWorkspaces(['@x/npm-only', 'packages/npm'])

    expect(await run()).toBeUndefined()
    expect(logged).toEqual([])
  })

  it('leaves an up-to-date deno.json alone', async () => {
    lib()
    setWorkspaces(['@x/lib', 'packages/lib'])
    await run()
    logged.length = 0

    expect(await run('--check')).toBeUndefined()
    expect(await run()).toBeUndefined()
    expect(logged).toEqual([])
  })

  it('--check fails on drift without writing', async () => {
    lib()
    setWorkspaces(['@x/lib', 'packages/lib'])

    expect(await run('--check')).toBe(1)
    expect(readDeno('packages/lib')).toEqual({})
    expect(logged).toContain('packages/lib/deno.json is out of date')
  })
})
