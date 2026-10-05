import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ESLint } from 'eslint'
import { packageJson } from '../configs/package-json'

// a workspace root whose manifest declares `packages/*` and `tool`
const temporary = mkdtempSync(path.join(tmpdir(), 'package-json-'))
const root = realpathSync(temporary)
const nested = JSON.stringify({ name: 'x', exports: './index.js' })
const files = {
  'package.json': JSON.stringify({ workspaces: ['packages/*', 'tool/'] }),
  'packages/a/package.json': nested,
  'tool/package.json': nested,
  'fixtures/a/package.json': nested,
}
for (const [file, content] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), content)
}

// the config reads the cwd's manifest
const cwd = process.cwd()
process.chdir(root)
afterAll(() => {
  process.chdir(cwd)
})

const nestedExports = async (file: string): Promise<boolean> => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: packageJson(),
  })
  const [result] = await eslint.lintFiles(file)
  return (
    result?.messages.some(
      ({ ruleId }) => ruleId === 'package-json/no-nested-exports',
    ) ?? false
  )
}

describe('packageJson', () => {
  it.each(['packages/a/package.json', 'tool/package.json'])(
    'allows `exports` in workspace %s',
    async (file) => {
      expect(await nestedExports(file)).toBe(false)
    },
  )

  it('flags `exports` in a nested non-workspace package.json', async () => {
    expect(await nestedExports('fixtures/a/package.json')).toBe(true)
  })
})
