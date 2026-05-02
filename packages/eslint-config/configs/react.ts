import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'

export const react = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.react) {
    return {}
  }

  const [
    reactCompilerPlugin,
    reactHooksPlugin,
    reactPerfPlugin,
    reactPlugin,
    nextPlugin,
    reactXPlugin,
    reactDomPlugin,
    reactWebApiPlugin,
  ] = await Promise.all([
    interopDefault(import('eslint-plugin-react-compiler')),
    interopDefault(import('eslint-plugin-react-hooks')),
    interopDefault(import('eslint-plugin-react-perf')),
    interopDefault(import('eslint-plugin-react')),
    interopDefault(import('@next/eslint-plugin-next')),
    interopDefault(import('eslint-plugin-react-x')),
    interopDefault(import('eslint-plugin-react-dom')),
    interopDefault(import('eslint-plugin-react-web-api')),
  ] as const)

  const files = ['**/*.jsx']

  if (config.typescript) {
    files.push('**/*.tsx')
  }

  return {
    name: 'lzear/react',

    files,

    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-compiler': reactCompilerPlugin,
      'react-dom': reactDomPlugin,
      'react-hooks': reactHooksPlugin,
      'react-perf': reactPerfPlugin,
      'react-web-api': reactWebApiPlugin,
      'react-x': reactXPlugin,
    },

    rules: {
      'react-compiler/react-compiler': 2,

      ...reactHooksPlugin.configs.recommended.rules,

      ...reactPerfPlugin.configs.recommended.rules,
      'react-perf/jsx-no-new-function-as-prop': 0,
      'react-perf/jsx-no-new-object-as-prop': 0,

      ...reactPlugin.configs.recommended.rules,

      ...nextPlugin.configs.recommended.rules,

      ...nextPlugin.configs['core-web-vitals'].rules,

      'react/react-in-jsx-scope': 0,
      'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],

      ...(config.typescript
        ? reactXPlugin.configs['recommended-typescript'].rules
        : reactXPlugin.configs.recommended.rules),

      ...reactDomPlugin.configs.recommended.rules,

      ...reactWebApiPlugin.configs.recommended.rules,
    },

    settings: {
      react: {
        fragment: 'Fragment',
        pragma: 'React',
        version: '19.0',
      },
      'react-x': {
        importSource: 'react',
        polymorphicPropName: 'as',
        version: '19.0',
      },
    },
  }
}
