import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gitignored } from '../configs/ignores'

describe('gitignored', () => {
  it('ignores what .gitignore lists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitignored-'))
    writeFileSync(path.join(dir, '.gitignore'), 'CLAUDE.local.md\n')
    expect(gitignored(dir)).toEqual([
      { name: 'lzear/gitignore', ignores: ['**/CLAUDE.local.md'] },
    ])
  })

  it('ignores nothing without a .gitignore', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitignored-'))
    expect(gitignored(dir)).toEqual([])
  })
})
