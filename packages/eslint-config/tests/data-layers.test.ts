import { ESLint } from 'eslint'
import config from '../index'

const lint = async (filePath: string, code: string) => {
  const eslint = new ESLint({
    overrideConfig: await config({ react: false, typescript: true }),
    overrideConfigFile: true,
  })
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((m) => `${String(m.line)} ${String(m.ruleId)}`)
}

describe('data layers', () => {
  it('lints Markdown and its TS code blocks, without type-aware rules', async () => {
    const markdown = [
      '# A',
      '',
      '### B',
      '',
      '```ts',
      "import x from '@lzear/eslint-config'",
      '',
      'var a = 1',
      '```',
      '',
    ].join('\n')
    expect(await lint('README.md', markdown)).toEqual([
      '3 markdown/heading-increment',
      '8 no-var',
    ])
  })

  it('lints JSON, JSONC and YAML', async () => {
    expect(await lint('a.json', '{ "a": 1, "a": 2 }\n')).toEqual([
      '1 json/no-duplicate-keys',
    ])
    expect(
      await lint('tsconfig.json', '{\n  // comment\n  "a": 1\n}\n'),
    ).toEqual([])
    expect(await lint('a.yml', 'a:\n  - 1\n  -\n')).toEqual([
      '3 yml/no-empty-sequence-entry',
    ])
  })

  it('formats deno.json as JSON.stringify does', async () => {
    const json = JSON.stringify({ workspace: ['a', 'b'] }, undefined, 2)
    expect(await lint('deno.json', json + '\n')).toEqual([])
    expect(await lint('a.json', json + '\n')).toEqual(['2 prettier/prettier'])
  })
})
