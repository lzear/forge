// Diffs the rules of two config snapshots (tests/snapshots/config.txt), per
// config block name. The snapshot is Vitest's pretty-format, not JSON (unescaped
// quotes in strings), so it is read line by line, at its fixed indentation.

type RuleValue = { severity: string; options: string }
type Blocks = Map<string, Map<string, RuleValue>>

const SEVERITIES: Record<string, string> = {
  '"error"': 'error',
  '"off"': 'off',
  '"warn"': 'warn',
  '0': 'off',
  '1': 'warn',
  '2': 'error',
}

const BLOCK_NAME = /^ {4}"name": "(.*)",$/
const RULE = /^ {6}"(.+?)": (.*)$/

const severityOf = (raw: string) => {
  const value = raw.trim().replace(/,$/, '')
  return SEVERITIES[value] ?? value
}

// `"a": 1,`, `},` → `{ "a": 1 }`
const compact = (lines: string[]) =>
  lines
    .map((line) => line.trim())
    .join(' ')
    .replace(/,$/, '')
    .replaceAll(/,(?= [\]}])/g, '')

// `"rule": 2,`, or `"rule": [` with severity and option lines, then `],`
const parseRule = ([head = '', ...lines]: string[]): [string, RuleValue] => {
  const [, rule = '', value = ''] = RULE.exec(head) ?? []
  if (value !== '[') return [rule, { options: '', severity: severityOf(value) }]
  const [severity = '', ...options] = lines.slice(0, -1)
  return [rule, { options: compact(options), severity: severityOf(severity) }]
}

const parseRules = (lines: string[]) => {
  const start = lines.indexOf('    "rules": {')
  if (start === -1) return new Map<string, RuleValue>()
  const body = lines.slice(start + 1, lines.indexOf('    },', start))
  const entries: string[][] = []
  for (const line of body)
    if (RULE.test(line)) entries.push([line])
    else entries.at(-1)?.push(line)
  return new Map(entries.map((entry) => parseRule(entry)))
}

// the top-level array's items, each from `  {` to `  },`
const splitBlocks = (text: string) => {
  const blocks: string[][] = []
  for (const line of text.split('\n'))
    if (line === '  {') blocks.push([])
    else blocks.at(-1)?.push(line)

  return blocks
}

/**
The rules of each config block, keyed by its name (`name (2)` on reuse).
*/
export const parseSnapshot = (text: string): Blocks => {
  const blocks: Blocks = new Map()
  const names = new Map<string, number>()
  for (const [index, lines] of splitBlocks(text).entries()) {
    const rules = parseRules(lines)
    if (rules.size === 0) continue
    const name =
      lines.map((line) => BLOCK_NAME.exec(line)?.[1]).find(Boolean) ??
      `#${index + 1}`
    const seen = (names.get(name) ?? 0) + 1
    names.set(name, seen)
    blocks.set(seen > 1 ? `${name} (${seen})` : name, rules)
  }
  return blocks
}

const MAX_INLINE = 60

const code = (text: string) => `\`${text}\``

const show = ({ options, severity }: RuleValue) =>
  options && options.length <= MAX_INLINE
    ? `${code(severity)} ${code(options)}`
    : code(severity)

const describeChange = (before: RuleValue, after: RuleValue) => {
  const changes: string[] = []
  if (before.severity !== after.severity)
    changes.push(`${code(before.severity)} → ${code(after.severity)}`)
  if (before.options === after.options) return changes.join(', ')
  changes.push(
    before.options.length <= MAX_INLINE && after.options.length <= MAX_INLINE
      ? `options ${code(before.options || 'none')} → ${code(after.options || 'none')}`
      : 'options changed',
  )
  return changes.join(', ')
}

const changeOf = (old?: RuleValue, next?: RuleValue) => {
  if (!old) return next && `added, ${show(next)}`
  return next ? describeChange(old, next) || undefined : 'removed'
}

const union = <T>(a: Map<string, T>, b: Map<string, T>) => [
  ...new Set([...a.keys(), ...b.keys()]),
]

// rules sharing a change share a line
const diffBlock = (
  before: Map<string, RuleValue>,
  after: Map<string, RuleValue>,
) => {
  const changes = Map.groupBy(
    union(before, after)
      .toSorted((a, b) => a.localeCompare(b))
      .map((rule) => ({
        change: changeOf(before.get(rule), after.get(rule)),
        rule,
      }))
      .filter(({ change }) => change !== undefined),
    ({ change }) => change,
  )
  return changes
    .entries()
    .map(
      ([change, rules]) =>
        `- ${rules.map(({ rule }) => code(rule)).join(', ')}: ${change}`,
    )
    .toArray()
}

const count = (size: number) => (size === 1 ? '1 rule' : `${size} rules`)

const diffBlocks = (old: Blocks, next: Blocks, name: string) => {
  const oldRules = old.get(name)
  const nextRules = next.get(name)
  if (!oldRules) return [`- new block, ${count(nextRules?.size ?? 0)}`]
  return nextRules
    ? diffBlock(oldRules, nextRules)
    : [`- block removed, ${count(oldRules.size)}`]
}

/**
A Markdown section of the rule changes, empty when none changed.
*/
export const diffSnapshots = (before: string, after: string): string => {
  const old = parseSnapshot(before)
  const next = parseSnapshot(after)
  const sections = union(next, old)
    .map((name) => ({ lines: diffBlocks(old, next, name), name }))
    .filter(({ lines }) => lines.length > 0)
    .map(({ lines, name }) => `#### ${code(name)}\n\n${lines.join('\n')}`)
  return sections.length > 0
    ? ['### ESLint rules', ...sections].join('\n\n')
    : ''
}

/**
Inserts the section into the changelog's first release, before its commits.
`version` is the current one: a changelog whose first heading still is that
release has no new one to annotate.
*/
export const insertSection = (
  changelog: string,
  section: string,
  version: string,
): string => {
  const lines = changelog.split('\n')
  const first = lines.findIndex((line) => line.startsWith('## '))
  if (first === -1 || lines[first] === `## ${version}`) return changelog
  let end = lines.findIndex(
    (line, index) =>
      index > first && (line === '### Commits' || line.startsWith('## ')),
  )
  if (end === -1) end = lines.length
  if (lines.slice(first, end).includes('### ESLint rules')) return changelog
  lines.splice(end, 0, section, '')
  return lines.join('\n')
}
