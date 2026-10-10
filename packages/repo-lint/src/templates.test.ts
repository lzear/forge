import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { syncTemplates } from './templates.ts'

const template = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, '../templates', name), 'utf8')

const write = (dir: string, file: string, content: string): void => {
  mkdirSync(path.join(dir, file, '..'), { recursive: true })
  writeFileSync(path.join(dir, file), content)
}

describe('syncTemplates', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'repo-lint-sync-test-'))
  })

  it('writes the bundled templates', async () => {
    write(dir, '.editorconfig', 'old')
    write(dir, '.codacy.yml', template('codacy.yml'))
    expect(await syncTemplates({ dir })).toEqual({
      dir,
      results: [
        { file: '.editorconfig', status: 'updated' },
        { file: '.codacy.yml', status: 'unchanged' },
        { file: 'lefthook.yml', status: 'created' },
        { file: '.github/zizmor.yml', status: 'created' },
      ],
    })
    expect(readFileSync(path.join(dir, '.editorconfig'), 'utf8')).toBe(
      template('editorconfig'),
    )
    expect(readFileSync(path.join(dir, '.github/zizmor.yml'), 'utf8')).toBe(
      template('zizmor.yml'),
    )
  })

  it('writes nothing on a dry run', async () => {
    write(dir, 'lefthook.yml', 'old')
    const { results } = await syncTemplates({ dir, dry: true })
    expect(results).toContainEqual({ file: 'lefthook.yml', status: 'updated' })
    expect(results).toContainEqual({ file: '.codacy.yml', status: 'created' })
    expect(readFileSync(path.join(dir, 'lefthook.yml'), 'utf8')).toBe('old')
    const again = await syncTemplates({ dir, dry: true })
    expect(again.results).toEqual(results)
  })

  it("keeps forge's template/ copies for older CLIs", async () => {
    write(
      dir,
      'package.json',
      JSON.stringify({ private: true, workspaces: ['packages/*'] }),
    )
    write(
      dir,
      'packages/forge/package.json',
      JSON.stringify({ name: '@lzear/forge' }),
    )
    const { results } = await syncTemplates({ dir })
    expect(results.map((r) => r.file)).toContain('template/lefthook.yml')
    expect(readFileSync(path.join(dir, 'template/.codacy.yml'), 'utf8')).toBe(
      template('codacy.yml'),
    )
  })
})
