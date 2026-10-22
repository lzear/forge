import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

// spread into your own `no-restricted-syntax`, which replaces forge's
export const RESTRICTED_SYNTAX: { selector: string; message: string }[] = [
  {
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='number']",
    message:
      'No number inputs: use a text field with inputMode (lzear.org NumberField).',
  },
]

export const react = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.react) return {}

  const [reactHooksPlugin, reactXPlugin, reactDomPlugin, reactWebApiPlugin] =
    await Promise.all([
      interopDefault(import('eslint-plugin-react-hooks')),
      interopDefault(import('eslint-plugin-react-x')),
      interopDefault(import('eslint-plugin-react-dom')),
      interopDefault(import('eslint-plugin-react-web-api')),
    ] as const)

  const files = config.typescript ? FILES.REACT : FILES.JSX

  return {
    name: 'lzear/react',

    files,

    plugins: {
      'react-dom': reactDomPlugin,
      'react-hooks': reactHooksPlugin,
      'react-web-api': reactWebApiPlugin,
      'react-x': reactXPlugin,
    },

    rules: {
      ...reactHooksPlugin.configs.recommended.rules,

      ...reactXPlugin.configs[
        config.typescript ? 'recommended-typescript' : 'recommended'
      ].rules,

      ...reactDomPlugin.configs.recommended.rules,
      // eslint-plugin-react recommended rules that tsc and the presets miss
      'react-x/no-missing-component-display-name': 2,
      'react-dom/no-unknown-property': [2, { ignore: ['jsx', 'global'] }],
      'react-dom/no-unsafe-target-blank': 2,
      'no-restricted-syntax': [2, ...RESTRICTED_SYNTAX],

      ...reactWebApiPlugin.configs.recommended.rules,
    },

    settings: {
      'react-x': {
        importSource: 'react',
        polymorphicPropName: 'as',
      },
    },
  }
}
