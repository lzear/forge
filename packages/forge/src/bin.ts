#!/usr/bin/env node

/**
The `forge` CLI: `init`, `check`, `update`, `setup` and `sync`.

```sh
npx @lzear/forge check
```

@module
*/

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as clack from '@clack/prompts'
import { Command, Option } from 'commander'
import pc from 'picocolors'
import { isAgent } from 'std-env'
import {
  checkLocal,
  detectRepo,
  initRepo,
  type InitReport,
  listSecrets,
  type PackageManager,
  type RepoReport,
  runUpdate,
  type SyncReport,
  type SyncStatus,
  syncTemplates,
  type UpdateReport,
  type UpdateResult,
} from '@lzear/repo-lint'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const isTTY = process.stdout.isTTY
const isDebug = process.env.DEBUG?.includes('forge') ?? false

const debug = (...arguments_: unknown[]) => {
  if (isDebug) console.error(pc.dim(`[debug] ${arguments_.join(' ')}`))
}

const log = {
  intro: (message: string) => {
    isTTY ? clack.intro(message) : console.log(message)
  },
  outro: (message: string) => {
    isTTY ? clack.outro(message) : console.log(message)
  },
  success: (message: string) => {
    isTTY ? clack.log.success(message) : console.log(`✓ ${message}`)
  },
  error: (message: string) => {
    isTTY ? clack.log.error(message) : console.error(`✗ ${message}`)
  },
  warn: (message: string) => {
    isTTY ? clack.log.warn(message) : console.warn(`! ${message}`)
  },
}

const program = new Command()

program
  .name('forge')
  .description('lzear repo tooling')
  .version(version, '-v, --version')
  .helpOption('-h, --help', 'show help')

const printFixes = (fixed: NonNullable<RepoReport['fixed']>): void => {
  for (const f of fixed) {
    const mark = f.pass ? pc.cyan('⚒') : pc.red('✗')
    const label = pc.dim(f.pass ? '(fixed)' : '(fix failed)')
    process.stdout.write(`  ${mark}  ${f.desc} ${label}\n`)
    const lines = f.detail?.split('\n') ?? []
    for (const line of lines) process.stdout.write(`       ${pc.dim(line)}\n`)
  }
  if (fixed.length > 0) process.stdout.write('\n')
}

const printSummary = (report: RepoReport): void => {
  const pass = report.results.filter((r) => r.pass).length
  const total = report.results.length
  for (const r of report.results) {
    // agents re-read tool output every turn: passes would only cost tokens
    if (isAgent && r.pass) continue
    process.stdout.write(
      `  ${r.pass ? pc.green('✓') : pc.red('✗')}  ${r.desc}\n`,
    )
    if (!r.pass && r.detail)
      for (const line of r.detail.split('\n'))
        process.stdout.write(`       ${pc.dim(line)}\n`)
  }
  const score =
    pass === total
      ? pc.green(`${pass}/${total}`)
      : pc.yellow(`${pass}/${total}`)
  process.stdout.write(`\n  ${score} checks passed\n`)
  const skipped = `${report.skipped.length} skipped`
  if (!isAgent && report.skipped.length > 0)
    process.stdout.write(`  ${pc.dim(skipped)}\n`)
}

const printResults = (report: RepoReport, json: boolean): boolean => {
  const isAnyFail = report.results.some((r) => !r.pass)
  if (json) {
    console.log(
      JSON.stringify(
        {
          repo: report.repo,
          results: report.results,
          skipped: report.skipped,
          ...(report.fixed && { fixed: report.fixed }),
          pass: !isAnyFail,
        },
        null,
        2,
      ),
    )
    return isAnyFail
  }
  if (report.fixed) printFixes(report.fixed)
  printSummary(report)
  return isAnyFail
}

const splitIds = (value: string): string[] =>
  value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

program
  .command('check')
  .description('audit the current repo against forge standards')
  .option('--skip-remote', 'skip GitHub checks (gh)', false)
  .option('--only <ids>', 'run only these checks (comma-separated)', splitIds)
  .option('--skip <ids>', 'skip these checks (comma-separated)', splitIds)
  .option('--fix', 'fix failures, then check again')
  .option('--json', 'output results as JSON', false)
  .action(
    async (options: {
      skipRemote: boolean
      only?: string[]
      skip?: string[]
      fix?: boolean
      json: boolean
    }) => {
      const { json, ...checkOptions } = options
      if (!json) process.stdout.write(`\n  ${pc.bold('forge check')}\n\n`)
      debug('checkLocal', process.cwd())
      let result: RepoReport
      try {
        result = await checkLocal(checkOptions)
      } catch (error) {
        log.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
      process.exit(printResults(result, json) ? 1 : 0)
    },
  )

const promptAndSet = async (
  s: { name: string; desc: string },
  repo: string,
): Promise<void> => {
  if (!isTTY) {
    log.error(
      `${s.name}: non-interactive shell — run in a TTY or: gh secret set ${s.name} --repo ${repo}`,
    )
    return
  }
  const value = await clack.password({
    message: `${s.name}: ${pc.dim(s.desc)}`,
  })
  if (clack.isCancel(value) || !value.trim()) {
    log.warn(`${s.name} skipped.`)
    return
  }
  // stdin, not --body, keeps the value out of the process list
  const result = spawnSync('gh', ['secret', 'set', s.name, '--repo', repo], {
    input: value.trim(),
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'],
  })
  if (result.status === 0) {
    log.success(`${s.name} set.`)
    return
  }
  const reason = result.stderr.trim() || `gh exited ${result.status}`
  log.error(`${s.name} not set: ${reason}`)
}

const REQUIRED_SECRETS = (repo: string) => [
  {
    name: 'CODACY_PROJECT_TOKEN',
    desc: `Codacy project token — find at app.codacy.com/gh/${repo}/settings/coverage`,
  },
]

program
  .command('setup')
  .description('check and set required GitHub secrets for a repo')
  .option('--repo <repo>', 'repo to set up (e.g. lzear/my-repo)')
  .option('--dry', 'check only, do not prompt for values', false)
  .option('--json', 'output results as JSON', false)
  .action(async (options: { repo?: string; dry: boolean; json: boolean }) => {
    const repo = options.repo ?? detectRepo()
    if (!repo) {
      log.error('Could not detect repo. Pass --repo <owner/repo>.')
      process.exit(1)
    }
    const { dry, json } = options

    if (!json) log.intro(pc.bold(`forge setup · ${pc.cyan(repo)}`))

    const existing = await listSecrets(repo)
    if (!existing) {
      log.error(
        'Failed to list secrets. Install gh (https://cli.github.com), then: gh auth login',
      )
      process.exit(1)
    }
    const secrets = REQUIRED_SECRETS(repo)
    const present = secrets.filter((s) => existing.includes(s.name))
    const missing = secrets.filter((s) => !existing.includes(s.name))

    if (json) {
      console.log(
        JSON.stringify(
          {
            repo,
            present: present.map((s) => s.name),
            missing: missing.map((s) => s.name),
          },
          null,
          2,
        ),
      )
      process.exit(missing.length > 0 ? 1 : 0)
    }

    for (const s of present) log.success(s.name)
    for (const s of missing) log.error(`${s.name} — missing`)

    if (missing.length === 0) {
      log.outro(pc.green('All secrets present.'))
      return
    }
    if (dry) {
      log.outro(pc.yellow('Dry run — skipping.'))
      return
    }

    for (const s of missing) await promptAndSet(s, repo)

    log.outro(pc.green('Done.'))
  })

const formatPackageManager = (pm: PackageManager): string => {
  const version = pm.version ? `@${pm.version}` : ''
  return `package manager: ${pm.name}${version} (${pm.source})`
}

const updateMark = (r: UpdateResult): string => {
  if (!r.pass) return pc.red('✗')
  return r.changed ? pc.yellow('↑') : pc.green('✓')
}

const printUpdateReport = (report: UpdateReport): void => {
  process.stdout.write(
    `  ${pc.dim(formatPackageManager(report.packageManager))}\n\n`,
  )
  for (const r of report.results) {
    process.stdout.write(`  ${updateMark(r)}  ${r.desc}\n`)
    if (r.detail && (r.changed || !r.pass))
      for (const line of r.detail.split('\n'))
        process.stdout.write(`       ${pc.dim(line)}\n`)
  }
  process.stdout.write('\n')
}

program
  .command('update')
  .description('update dependencies, packageManager, and runtime version files')
  .option('--dry', 'preview changes, do not write', false)
  .option('--no-install', 'skip install & lockfile refresh')
  .option('--json', 'output results as JSON', false)
  .action(
    async (options: { dry: boolean; install: boolean; json: boolean }) => {
      const { dry: isDry, install: isInstall, json: isJson } = options
      if (!isJson)
        process.stdout.write(
          `\n  ${pc.bold('forge update')}${isDry ? pc.dim(' (dry run)') : ''}\n\n`,
        )
      debug('runUpdate', process.cwd())
      const report = await runUpdate({ dry: isDry, install: isInstall })
      const isAnyFail = report.results.some((r) => !r.pass)
      if (isJson)
        console.log(JSON.stringify({ ...report, pass: !isAnyFail }, null, 2))
      else printUpdateReport(report)
      process.exit(isAnyFail ? 1 : 0)
    },
  )

const SYNC_LABELS: Record<SyncStatus, [string, string]> = {
  unchanged: ['(unchanged)', '(unchanged)'],
  created: ['(created)', '(would create)'],
  updated: ['(updated)', '(would update)'],
}

program
  .command('sync')
  .description('write the template files bundled with this forge version')
  .option('--dry', 'print what would change, do not write', false)
  .option('--check', 'exit 1 when a file drifted, do not write', false)
  .action(async (options: { dry: boolean; check: boolean }) => {
    const isDry = options.dry || options.check
    log.intro(pc.bold('forge sync'))
    let report: SyncReport
    try {
      report = await syncTemplates({ dry: isDry })
    } catch (error) {
      log.error(String(error))
      log.outro(pc.red('Done with errors.'))
      process.exit(1)
    }
    for (const { file, status } of report.results) {
      const line = `${file} ${pc.dim(SYNC_LABELS[status][isDry ? 1 : 0])}`
      if (isDry && status !== 'unchanged') log.warn(line)
      else log.success(line)
    }
    const isDrift =
      options.check && report.results.some((r) => r.status !== 'unchanged')
    log.outro(isDrift ? pc.red('Drifted. Run: forge sync') : pc.green('Done.'))
    if (isDrift) process.exit(1)
  })

const INIT_LABELS: Record<SyncStatus, [string, string]> = {
  unchanged: ['(exists)', '(exists)'],
  created: ['(created)', '(would create)'],
  updated: ['(updated)', '(would update)'],
}

const printInitReport = (report: InitReport, isDry: boolean): void => {
  for (const { file, status, detail } of report.results) {
    const label = pc.dim(INIT_LABELS[status][isDry ? 1 : 0])
    const mark = status === 'unchanged' ? pc.dim('·') : pc.cyan('⚒')
    process.stdout.write(`  ${mark}  ${file} ${label}\n`)
    const lines = detail?.split('\n') ?? []
    for (const line of lines) process.stdout.write(`       ${pc.dim(line)}\n`)
  }
  process.stdout.write(`\n  ${pc.bold('Next')}\n`)
  for (const step of report.next) process.stdout.write(`  →  ${step}\n`)
}

program
  .command('init')
  .description('scaffold the missing forge files, then check once installed')
  .addOption(new Option('--lib', 'a published library (default)'))
  .addOption(new Option('--app', 'a private app').conflicts('lib'))
  .option('--react', 'React tsconfig and Vitest config', false)
  .addOption(new Option('--bun', 'Bun (default when bun.lock exists)'))
  .addOption(new Option('--yarn', 'Yarn').conflicts('bun'))
  .option('--dry', 'print what would be written, do not write', false)
  .action(
    async (options: {
      app?: boolean
      react: boolean
      bun?: boolean
      yarn?: boolean
      dry: boolean
    }) => {
      const { dry: isDry } = options
      process.stdout.write(
        `\n  ${pc.bold('forge init')}${isDry ? pc.dim(' (dry run)') : ''}\n\n`,
      )
      const packageManager = options.bun ? 'bun' : options.yarn && 'yarn'
      const report = await initRepo({
        kind: options.app ? 'app' : 'lib',
        react: options.react,
        ...(packageManager && { packageManager }),
        dry: isDry,
        version,
      })
      printInitReport(report, isDry)
      // without the dev deps, the check would fail; the report's last step runs it
      if (isDry || !report.isInstalled) return
      process.stdout.write(`\n  ${pc.bold('forge check --skip-remote')}\n\n`)
      const result = await checkLocal({ skipRemote: true })
      process.exit(printResults(result, false) ? 1 : 0)
    },
  )

const handleSignal = () => {
  if (isTTY) clack.cancel('Cancelled.')
  process.exit(130)
}
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)

await program.parseAsync()
