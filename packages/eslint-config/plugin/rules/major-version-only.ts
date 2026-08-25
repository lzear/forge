import { type Rule } from 'eslint'

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
  if (!match) return null

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

const isIgnored = (packageName: string, ignore: (string | RegExp)[]): boolean =>
  ignore.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(packageName)
      : pattern === packageName,
  )

// Momoa AST (@eslint/json)
interface JsonString {
  type: 'String'
  value: string
}
interface JsonObject {
  type: 'Object'
  members: JsonMember[]
}
interface JsonOther {
  type: 'Array' | 'Number' | 'Boolean' | 'Null'
}
interface JsonMember {
  type: 'Member'
  name: JsonString
  value: JsonString | JsonObject | JsonOther
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
    const options = context.options[0] as Options | undefined
    const ignore: (string | RegExp)[] = (options?.ignore ?? []).map((item) =>
      typeof item === 'string' ? item : new RegExp(item.regex),
    )

    return {
      Member: (rawNode: Rule.Node) => {
        const node = rawNode as unknown as JsonMember

        if (!DEP_FIELDS.has(node.name.value)) return

        const dependenciesNode = node.value
        if (dependenciesNode.type !== 'Object') return

        for (const member of dependenciesNode.members) {
          if (isIgnored(member.name.value, ignore)) continue

          const versionNode = member.value
          if (versionNode.type !== 'String') continue

          const version = versionNode.value
          const suggested = simplify(version)
          if (!suggested) continue

          context.report({
            node: versionNode as unknown as Rule.Node,
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
