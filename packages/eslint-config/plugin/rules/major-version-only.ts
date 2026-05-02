import type { Rule } from 'eslint'

const DEP_FIELDS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
])

// Matches operator + major + at least .minor, optionally .patch — no prerelease
const VERSION_RE = /^([~^])(\d+)\.(\d+)(?:\.\d+)?$/

const simplify = (version: string): string | null => {
  const match = VERSION_RE.exec(version)
  if (!match) {
    return null
  }
  const [, operator, major, minor] = match

  // For 0.x packages, ^ semver means minor is the "major" (breaking) version.
  // ^0.5.4 → ^0.5 (keep major.minor), not ^0
  if (major === '0' && operator === '^') {
    const target = `^0.${minor}`
    return target === version ? null : target
  }

  const target = `${operator}${major}`
  return target === version ? null : target
}

const isIgnored = (pkgName: string, ignore: (string | RegExp)[]): boolean =>
  ignore.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(pkgName) : pattern === pkgName,
  )

interface JsonKey {
  type: string
  value?: unknown
  name?: string
}
interface JsonLiteral {
  type: 'JSONLiteral'
  value: unknown
}
interface JsonObject {
  type: 'JSONObjectExpression'
  properties: JsonProp[]
}
interface JsonProp {
  key: JsonKey
  value: JsonLiteral | JsonObject
}

interface Options {
  ignore?: (string | { regex: string })[]
}

export const majorVersionOnly: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce major-only version specifiers in package.json',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignore: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: { regex: { type: 'string' } },
                  required: ['regex'],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useMajorOnly: 'Use "{{suggested}}" instead of "{{current}}"',
    },
  },

  create: (context) => {
    const opts = context.options[0] as Options | undefined
    const ignore: (string | RegExp)[] = (opts?.ignore ?? []).map((item) =>
      typeof item === 'string' ? item : new RegExp(item.regex),
    )

    return {
      JSONProperty: (rawNode: Rule.Node) => {
        const node = rawNode as unknown as JsonProp
        const keyName =
          node.key.type === 'JSONLiteral'
            ? String(node.key.value)
            : (node.key.name ?? '')

        if (!DEP_FIELDS.has(keyName)) {
          return
        }

        const depsNode = node.value
        if (depsNode.type !== 'JSONObjectExpression') {
          return
        }

        for (const prop of depsNode.properties) {
          const pkgName =
            prop.key.type === 'JSONLiteral'
              ? String(prop.key.value)
              : (prop.key.name ?? '')

          if (isIgnored(pkgName, ignore)) {
            continue
          }

          const versionNode = prop.value
          if (versionNode.type !== 'JSONLiteral') {
            continue
          }

          const version = versionNode.value
          if (typeof version !== 'string') {
            continue
          }

          const suggested = simplify(version)
          if (!suggested) {
            continue
          }

          context.report({
            node: versionNode,
            messageId: 'useMajorOnly',
            data: { current: version, suggested },
            fix: (fixer) =>
              fixer.replaceText(versionNode, JSON.stringify(suggested)),
          })
        }
      },
    }
  },
}
