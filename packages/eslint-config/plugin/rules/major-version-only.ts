import type { Rule } from 'eslint'

const DEP_FIELDS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
])

// Captures operator + version up to its leftmost non-zero part, the breaking
// one (^1.2.3 → ^1, ^0.5.4 → ^0.5), when more parts follow; no prerelease.
// ^0.0.2 has none after it, so it stays
const VERSION_RE = /^([~^](?:0\.)*[1-9]\d*)(?:\.\d+)+$/

const simplify = (version: string): string | null =>
  VERSION_RE.exec(version)?.[1] ?? null

const isIgnored = (packageName: string, ignore: (string | RegExp)[]): boolean =>
  ignore.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(packageName)
      : pattern === packageName,
  )

// Momoa AST (@eslint/json)
type JsonString = {
  type: 'String'
  value: string
}
type JsonObject = {
  type: 'Object'
  members: JsonMember[]
}
type JsonOther = {
  type: 'Array' | 'Number' | 'Boolean' | 'Null'
}
type JsonMember = {
  type: 'Member'
  name: JsonString
  value: JsonString | JsonObject | JsonOther
}

type Options = {
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
