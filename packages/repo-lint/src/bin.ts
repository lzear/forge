#!/usr/bin/env node

import { mkdirSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { checkLocal, checkRepo, type RepoReport } from './index.js'

const { values } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    repos: { type: 'string' },
    token: { type: 'string' },
    dir: { type: 'string', default: `${process.env.HOME ?? '/tmp'}/repo-lint` },
    'skip-remote': { type: 'boolean', default: false },
  },
})

const printReport = (result: RepoReport): boolean => {
  let isAnyFail = false
  const pass = result.results.filter((r) => r.pass).length
  const total = result.results.length
  for (const r of result.results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.desc}`)
    if (!r.pass) isAnyFail = true
  }
  console.log(`\n  ${pass}/${total} checks passed`)
  return isAnyFail
}

const main = async (): Promise<void> => {
  let isAnyFail = false

  if (values.local) {
    console.log(`\n── ${process.cwd()}`)
    const result = await checkLocal({ skipRemote: values['skip-remote'] })
    isAnyFail = printReport(result)
  } else {
    if (!values.repos) {
      console.error(
        'Usage:\n' +
          '  repo-lint --local                              # check current repo\n' +
          '  repo-lint --repos lzear/r1,lzear/r2           # check remote repos\n' +
          'Options:\n' +
          '  --token ghp_xxx   GitHub token for private repos\n' +
          '  --skip-remote     skip secret checks (no gh auth needed)',
      )
      process.exit(1)
    }

    mkdirSync(values.dir, { recursive: true })

    const repos = values.repos.split(',').map((r) => r.trim())

    for (const repo of repos) {
      console.log(`\n── ${repo}`)
      try {
        const result = await checkRepo(repo, {
          ...(values.token !== undefined && { token: values.token }),
          baseDir: values.dir,
          skipRemote: values['skip-remote'],
        })
        if (printReport(result)) isAnyFail = true
      } catch {
        console.log('  ✗ could not clone repo')
        isAnyFail = true
      }
    }
  }

  process.exit(isAnyFail ? 1 : 0)
}

await main()
