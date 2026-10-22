import { Linter } from 'eslint'
import config from '../index'

const lintJsx = async (code: string) => {
  const configs = await config({ react: true })
  const react = configs.find((item) => item.name === 'lzear/react')
  const rule = react?.rules?.['no-restricted-syntax']
  const linter = new Linter()
  return linter.verify(code, {
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-restricted-syntax': rule },
  })
}

describe('number-input ban', () => {
  it('rejects <input type="number">', async () => {
    const messages = await lintJsx('const a = <input type="number" />')
    expect(messages.map((m) => m.message)).toEqual([
      'No number inputs: use a text field with inputMode (lzear.org NumberField).',
    ])
  })

  it('allows type="number" on other elements', async () => {
    expect(await lintJsx('const a = <XAxis type="number" />')).toEqual([])
  })
})
