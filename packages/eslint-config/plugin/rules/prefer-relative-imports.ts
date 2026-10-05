import fs from 'node:fs'
import path from 'node:path'
import type { Rule } from 'eslint'
import { interopDefault } from '../../utils'

const moduleVisitor = await interopDefault(
  import('eslint-module-utils/moduleVisitor'),
)

const resolve = await interopDefault(import('eslint-module-utils/resolve'))

type SourceNode = Rule.Node & { value: string }

const findPackageRoot = (filePath: string): string | null => {
  let current = path.dirname(filePath)
  const root = path.parse(current).root

  while (current && current !== root) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current

    current = path.dirname(current)
  }
  return null
}

// the resolved path leaves the current package or enters node_modules
const leavesPackage = (from: string, resolved: string): boolean => {
  const pkgRoot = findPackageRoot(from)
  if (!pkgRoot) return false
  const relToPkg = path.relative(pkgRoot, resolved)
  return (
    relToPkg.startsWith('..') ||
    path.isAbsolute(relToPkg) ||
    relToPkg.split(path.sep).includes('node_modules')
  )
}

const dotted = (p: string) => (p.startsWith('.') ? p : `./${p}`)

// drops the extension and any /index suffix, to match extensionless imports
const stripExtension = (rel: string): string => {
  const extension = path.extname(rel)
  if (!extension) return rel
  const withoutExtension = rel.slice(0, -extension.length)
  return withoutExtension.endsWith('/index')
    ? withoutExtension.slice(0, -'/index'.length) || '.'
    : withoutExtension
}

const toRelative = (
  from: string,
  importPath: string,
  context: Rule.RuleContext,
): string | null => {
  const resolved = resolve(importPath, context)
  if (!resolved || leavesPackage(from, resolved)) return null

  const rel = path.relative(path.dirname(from), resolved)
  if (!rel) return null

  return dotted(path.extname(importPath) ? rel : stripExtension(dotted(rel)))
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
    const options = (context.options as Options)[0]
    const maxParentPrefixes = options?.maxParentPrefixes ?? 1
    const filename = context.physicalFilename

    const check = (source: SourceNode) => {
      const importPath = source.value
      if (typeof importPath !== 'string' || importPath.startsWith('.')) return

      // resolves without the query (Vite's `?url`, `?raw`), then keeps it
      const queryStart = importPath.indexOf('?')
      const query = queryStart === -1 ? '' : importPath.slice(queryStart)
      const bare = toRelative(
        filename,
        importPath.slice(0, importPath.length - query.length),
        context,
      )
      const relative = bare && bare + query
      if (
        !relative ||
        relative.length >= importPath.length ||
        countParentPrefixes(relative) > maxParentPrefixes
      )
        return

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
