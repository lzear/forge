import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detect } from '../configs/detect'
import config from '../index'

const project = (files: Record<string, unknown>): string => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'detect-'))
  const root = realpathSync(temporary)
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(content))
  }
  return root
}

describe('detect', () => {
  it('enables nothing without dependencies', () => {
    expect(detect(project({ 'package.json': {} }))).toEqual({
      react: false,
      typescript: false,
      vitest: false,
    })
  })

  it('reads the root dependencies', () => {
    const root = project({
      'package.json': {
        dependencies: { react: '^19' },
        devDependencies: { typescript: '^6', vitest: '^5' },
      },
    })
    expect(detect(root)).toEqual({
      react: true,
      typescript: true,
      vitest: true,
    })
  })

  it("reads the workspaces' dependencies and tsconfig.json", () => {
    const root = project({
      'package.json': { workspaces: ['apps/*'] },
      'apps/web/package.json': { dependencies: { react: '^19' } },
      'apps/web/tsconfig.json': {},
      'other/package.json': { devDependencies: { vitest: '^5' } },
      'apps/web/node_modules/x/package.json': { dependencies: { vitest: '*' } },
    })
    expect(detect(root)).toEqual({
      react: true,
      typescript: true,
      vitest: false,
    })
  })

  it('reads `workspaces.packages` and a root tsconfig.json', () => {
    const root = project({
      'package.json': { workspaces: { packages: ['lib'] } },
      'tsconfig.json': {},
      'lib/package.json': { peerDependencies: { react: '*' } },
    })
    expect(detect(root)).toMatchObject({ react: true, typescript: true })
  })

  it('tolerates a missing manifest', () => {
    expect(detect(project({}))).toEqual({
      react: false,
      typescript: false,
      vitest: false,
    })
  })
})

const names = async (options = {}): Promise<(string | undefined)[]> => {
  const configs = await config(options)
  return configs.map(({ name }) => name)
}

describe('config defaults', () => {
  const cwd = process.cwd()
  afterEach(() => {
    process.chdir(cwd)
  })

  it('skips undetected layers', async () => {
    process.chdir(project({ 'package.json': {} }))
    const layers = await names()
    expect(layers).not.toContain('lzear/react')
    expect(layers).not.toContain('lzear/vitest')
  })

  it('lets explicit options win', async () => {
    process.chdir(project({ 'package.json': {} }))
    expect(await names({ react: true })).toContain('lzear/react')
    process.chdir(project({ 'package.json': { dependencies: { react: '*' } } }))
    expect(await names({ react: false })).not.toContain('lzear/react')
  })
})
