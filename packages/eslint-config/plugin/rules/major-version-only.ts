import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Rule } from 'eslint'
// repo-lint's `forge init` writes the same ranges
// eslint-disable-next-line import-x/no-relative-packages -- tsdown inlines it, so the npm-only package needs no dependency on repo-lint
import { caretRange } from '../../../repo-lint/src/range.ts'

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

const simplify = (version: string): string | undefined =>
  VERSION_RE.exec(version)?.[1]

// ^0 and ^0.0 take every 0.x release, ~0.0.2 every later 0.0.x: each may break
const BARE_ZERO_RE = /^[~^]0(?:\.0)?$/
const TILDE_PATCH_RE = /^~(0\.0\.\d+)$/

// Read from disk, not `require`, as a package's `exports` may hide its package.json
const installedVersion = (name: string, from: string): string | undefined => {
  const dirs = createRequire(from).resolve.paths(name) ?? []
  for (const dir of dirs)
    try {
      const manifest = readFileSync(
        path.join(dir, name, 'package.json'),
        'utf8',
      )
      return (JSON.parse(manifest) as { version?: string }).version
    } catch {
      // not installed there
    }

  return undefined
}

// A bare zero takes the installed version's range; none when nothing is installed
const suggest = (
  name: string,
  version: string,
  filename: string,
): string | undefined => {
  const tilde = TILDE_PATCH_RE.exec(version)?.[1]
  if (tilde) return `^${tilde}`
  if (!BARE_ZERO_RE.test(version)) return simplify(version)
  const installed = installedVersion(name, filename)
  return installed && caretRange(installed)
}

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

export const majorVersionOnly: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce ranges up to the breaking part of the version in package.json',
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
      tooWide:
        '"{{current}}" accepts every 0.x release, and each may break: pin the minor, as in "^0.5"',
    },
  },

  create: (context) => {
    type Options = {
      ignore?: (string | { regex: string })[]
    }
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
          const suggested = suggest(
            member.name.value,
            version,
            context.filename,
          )
          if (suggested)
            context.report({
              node: versionNode as unknown as Rule.Node,
              messageId: 'useMajorOnly',
              data: { current: version, suggested },
              fix: (fixer) =>
                fixer.replaceText(versionNode, JSON.stringify(suggested)),
            })
          else if (BARE_ZERO_RE.test(version))
            context.report({
              node: versionNode as unknown as Rule.Node,
              messageId: 'tooWide',
              data: { current: version },
            })
        }
      },
    }
  },
}
