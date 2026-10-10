import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const markdown = async (
  config: ConfigOptions,
): Promise<Linter.Config[]> => {
  if (!config.markdown) return []

  const [markdownPlugin, tseslint] = await Promise.all([
    interopDefault(import('@eslint/markdown')),
    config.typescript ? interopDefault(import('typescript-eslint')) : undefined,
  ])

  const codeBlocks = markdownPlugin.processors.markdown
  const codeBlocksConfig = markdownPlugin.configs.processor.at(-1)

  return [
    {
      name: 'lzear/markdown',

      files: FILES.MARKDOWN,

      plugins: { markdown: markdownPlugin },

      language: 'markdown/gfm',

      languageOptions: { frontmatter: 'yaml' },

      // the file itself (a string block is linted as is), then its code blocks
      processor: {
        meta: { name: 'lzear/markdown' },
        supportsAutofix: true,
        preprocess: (text, filename) => [
          text,
          ...codeBlocks.preprocess(text, filename),
        ],
        postprocess: ([own = [], ...blocks], filename) => [
          ...own,
          ...codeBlocks.postprocess(blocks, filename),
        ],
      },

      rules: markdownPlugin.configs.recommended[0]?.rules ?? {},
    },
    {
      name: 'lzear/markdown/code-blocks',

      files: FILES.MARKDOWN_CODE,

      languageOptions: {
        parserOptions: {
          // strict mode without a "use strict" atop each block
          ecmaFeatures: { impliedStrict: true },
          // snippets sit in no tsconfig: no type-aware rules
          ...(tseslint && { program: null, projectService: false }),
        },
      },

      // examples: imports show the consumer's view, values go unused
      rules: {
        ...codeBlocksConfig?.rules,
        ...tseslint?.configs.disableTypeChecked.rules,
        ...(tseslint && { '@typescript-eslint/no-unused-vars': 0 as const }),
        'lzear/prefer-relative-imports': 0,
        'sonarjs/no-unused-vars': 0,
        'unicorn/no-top-level-side-effects': 0,
      },
    },
  ]
}
