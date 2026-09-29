import { RuleTester } from 'eslint'
import packageJsonPlugin from 'eslint-package-json'
import { majorVersionOnly } from '../plugin/rules/major-version-only'

const { plugins = {}, language = 'json/json' } =
  packageJsonPlugin.configs.recommended

const ruleTester = new RuleTester({ plugins, language })

const deps = (field: string, versions: Record<string, unknown>): string =>
  JSON.stringify({ [field]: versions })

ruleTester.run('major-version-only', majorVersionOnly, {
  valid: [
    deps('dependencies', { a: '^1', b: '~2', c: '^0.5' }),
    deps('dependencies', { a: '1.2.3', b: '^1.0.0-beta.1', c: 'workspace:*' }),
    deps('scripts', { a: '^1.2.3' }),
    deps('dependencies', { a: 1 }),
    JSON.stringify({ dependencies: ['^1.2.3'] }),
    {
      code: deps('dependencies', { keep: '^1.2.3', '@scope/x': '^2.0.0' }),
      options: [{ ignore: ['keep', { regex: '^@scope/' }] }],
    },
  ],
  invalid: [
    {
      code: deps('dependencies', { a: '^1.2.3' }),
      output: deps('dependencies', { a: '^1' }),
      errors: [{ messageId: 'useMajorOnly' }],
    },
    {
      code: deps('devDependencies', { a: '~2.3' }),
      output: deps('devDependencies', { a: '~2' }),
      errors: [{ messageId: 'useMajorOnly' }],
    },
    {
      code: deps('peerDependencies', { a: '^0.5.4', b: '~0.5.4' }),
      output: deps('peerDependencies', { a: '^0.5', b: '~0' }),
      errors: [{ messageId: 'useMajorOnly' }, { messageId: 'useMajorOnly' }],
    },
    {
      code: deps('optionalDependencies', { skip: '^1.2', a: '^3.0' }),
      output: deps('optionalDependencies', { skip: '^1.2', a: '^3' }),
      options: [{ ignore: ['skip'] }],
      errors: [{ messageId: 'useMajorOnly' }],
    },
  ],
})
