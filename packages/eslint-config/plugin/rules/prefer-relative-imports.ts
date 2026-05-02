import path from 'node:path'
import type { Rule } from 'eslint'
import { interopDefault } from '../../utils'

const moduleVisitor = await interopDefault(
  import('eslint-module-utils/moduleVisitor'),
)

const resolve = await interopDefault(import('eslint-module-utils/resolve'))

type SourceNode = Rule.Node & { value: string }

const toRelative = (
  from: string,
  importPath: string,
  context: Rule.RuleContext,
): string | null => {
  const resolved = resolve(importPath, context)
  if (!resolved) {
    return null
  }

  let rel = path.relative(path.dirname(from), resolved)
  if (!rel) {
    return null
  }
  if (!rel.startsWith('.')) {
    rel = `./${rel}`
  }

  // If the original had no extension but the resolved path does,
  // strip the extension (and /index suffix) to match import style
  if (!path.extname(importPath)) {
    const ext = path.extname(rel)
    if (ext) {
      const withoutExt = rel.slice(0, -ext.length)
      rel = withoutExt.endsWith('/index')
        ? withoutExt.slice(0, -'/index'.length) || '.'
        : withoutExt
      if (!rel.startsWith('.')) {
        rel = `./${rel}`
      }
    }
  }

  return rel
}

const countParentPrefixes = (p: string) => {
  const match = /^(?:\.\.\/)+/.exec(p)
  return match ? match[0].length / 3 : 0
}

type Options = [{ maxParentPrefixes?: number }?]

export const preferRelativeImports: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Prefer relative imports when a shorter path exists' },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: { maxParentPrefixes: { type: 'number', minimum: 0 } },
        additionalProperties: false,
      },
    ],
    messages: {
      preferRelative:
        'Use relative import "{{relative}}" instead of "{{original}}"',
    },
  },

  create: (context) => {
    const opts = (context.options as Options)[0]
    const maxParentPrefixes = opts?.maxParentPrefixes ?? 1
    const filename = context.physicalFilename

    const check = (source: SourceNode) => {
      const importPath = source.value
      if (typeof importPath !== 'string' || importPath.startsWith('.')) {
        return
      }

      const relative = toRelative(filename, importPath, context)
      if (!relative || relative.length >= importPath.length) {
        return
      }
      if (countParentPrefixes(relative) > maxParentPrefixes) {
        return
      }

      context.report({
        node: source,
        messageId: 'preferRelative',
        data: { relative, original: importPath },
        fix: (fixer) => fixer.replaceText(source, JSON.stringify(relative)),
      })
    }

    return moduleVisitor(check, { commonjs: false })
  },
}
