import { readFileSync } from 'node:fs'
import {
  diffSnapshots,
  insertSection,
  parseSnapshot,
} from '../scripts/rule-diff.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

const before = fixture('rules-before.txt')
const after = fixture('rules-after.txt')

describe('parseSnapshot', () => {
  it('reads top-level rules per block, numbering reused names', () => {
    const blocks = parseSnapshot(before)
    expect(blocks.keys().toArray()).toEqual([
      'lzear/core',
      'lzear/typescript > typescript-eslint/base',
      'lzear/typescript > typescript-eslint/base (2)',
      'lzear/legacy',
    ])
    expect(Object.fromEntries(blocks.get('lzear/core') ?? [])).toEqual({
      curly: { options: '"multi"', severity: 'error' },
      eqeqeq: { options: '', severity: 'error' },
      'no-console': { options: '', severity: 'warn' },
      'no-shadow': { options: '{ "hoist": "all" }', severity: 'error' },
      'no-var': { options: '', severity: 'error' },
      'unicorn/no-null': { options: '', severity: 'error' },
    })
  })
})

describe('diffSnapshots', () => {
  it('lists added, removed and changed rules per block', () => {
    expect(diffSnapshots(before, after)).toBe(
      [
        '### ESLint rules',
        '#### `lzear/core`',
        [
          '- `curly`: options `"multi"` → `"all"`',
          '- `no-console`: `warn` → `error`',
          '- `no-shadow`: `error` → `warn`, options `{ "hoist": "all" }` → `{ "hoist": "functions" }`',
          '- `prefer-const`: added, `error` `{ "destructuring": "all" }`',
          '- `unicorn/no-null`: `error` → `off`',
        ].join('\n'),
        '#### `lzear/typescript > typescript-eslint/base (2)`',
        '- `no-redeclare`: `off` → `error`',
        '#### `lzear/json`',
        '- new block, 1 rule',
        '#### `lzear/legacy`',
        '- block removed, 1 rule',
      ].join('\n\n'),
    )
  })

  it('groups rules sharing a change', () => {
    const warned = after
      .replace('"no-console": 2', '"no-console": 1')
      .replace('"unicorn/no-null": 0', '"unicorn/no-null": 1')
    const off = after.replace('"no-console": 2', '"no-console": 0')
    expect(diffSnapshots(warned, off)).toContain(
      '- `no-console`, `unicorn/no-null`: `warn` → `off`',
    )
  })

  it('is empty when no rule changed', () => {
    expect(diffSnapshots(after, after)).toBe('')
  })
})

describe('insertSection', () => {
  const changelog =
    '## 1.1.0\n\nA fix.\n\n### Commits\n\n- abc\n\n## 1.0.0\n\nOld.\n'

  it('goes before the pending release commits', () => {
    expect(insertSection(changelog, '### ESLint rules\n\n- x', '1.0.0')).toBe(
      '## 1.1.0\n\nA fix.\n\n### ESLint rules\n\n- x\n\n### Commits\n\n- abc\n\n## 1.0.0\n\nOld.\n',
    )
  })

  it('ends a release without commits', () => {
    expect(
      insertSection('## 1.1.0\n\nA fix.\n', '### ESLint rules', '1.0.0'),
    ).toBe('## 1.1.0\n\nA fix.\n\n### ESLint rules\n')
  })

  it('skips a changelog without a pending release, or already noted', () => {
    expect(insertSection(changelog, '### ESLint rules', '1.1.0')).toBe(
      changelog,
    )
    const noted = insertSection(changelog, '### ESLint rules', '1.0.0')
    expect(insertSection(noted, '### ESLint rules', '1.0.0')).toBe(noted)
  })
})
