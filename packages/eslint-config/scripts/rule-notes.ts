// Prints the rules changed since a ref (default: the last eslint-config
// release tag) as Markdown; `--changelog <file>` also inserts them into the
// pending release that `lzear-changelog` prepended.
//   node packages/eslint-config/scripts/rule-notes.ts [ref] [--changelog CHANGELOG.md]

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { diffSnapshots, insertSection } from './rule-diff.ts'

const packageDirectory = new URL('..', import.meta.url)
const SNAPSHOT = 'tests/snapshots/config.txt'

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: packageDirectory,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

// releases are tagged `v*` since the packages share one version
const lastTag = () => {
  try {
    return git(
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      '@lzear/eslint-config@*',
      '--match',
      'v*',
    ).trim()
  } catch {
    return
  }
}

const main = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { changelog: { type: 'string' } },
  })
  const ref = positionals[0] ?? lastTag()
  if (!ref) {
    console.error('rule-notes: no release tag, nothing to diff')
    return
  }

  const section = diffSnapshots(
    git('show', `${ref}:./${SNAPSHOT}`),
    readFileSync(new URL(SNAPSHOT, packageDirectory), 'utf8'),
  )
  if (!section) {
    console.error(`rule-notes: no rule changed since ${ref}`)
    return
  }
  console.log(section)
  if (!values.changelog) return

  const { version } = JSON.parse(
    readFileSync(new URL('package.json', packageDirectory), 'utf8'),
  ) as { version: string }
  const changelog = readFileSync(values.changelog, 'utf8')
  writeFileSync(values.changelog, insertSection(changelog, section, version))
}

main()
