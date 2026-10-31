import { expect, it } from 'vitest'
import { caretRange } from './range.ts'

it.each([
  ['5.2.0', '^5'],
  ['0.23.1', '^0.23'],
  ['0.0.4', '^0.0.4'],
  ['1.0.0-beta.1', '^1'],
  ['next', undefined],
])('caretRange(%s) is %s', (version, range) => {
  expect(caretRange(version)).toBe(range)
})
