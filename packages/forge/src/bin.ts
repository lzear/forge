#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import * as clack from '@clack/prompts'
import { Command } from 'commander'
import pc from 'picocolors'
import {
  checkLocal,
  checkRepo,
  type PackageManager,
  type RepoReport,
  runUpdate,
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
  spinner: () =>
    isTTY
      ? clack.spinner()
      : {
          start: (message: string) => {
            debug(message)
          },
          stop: (message: string) => {
            debug(message)
          },
        },
}

const program = new Command()

program
  .name('forge')
  .description('lzear repo tooling')
  .version(version, '-v, --version')
  .helpOption('-h, --help', 'show help')

const DEFAULT_DIR = path.join(homedir(), '.cache', 'forge')

const printResults = (report: RepoReport, json: boolean): boolean => {
  const isAnyFail = report.results.some((r) => !r.pass)
  if (json) {
    console.log(
      JSON.stringify(
        { repo: report.repo, results: report.results, pass: !isAnyFail },
        null,
        2,
      ),
    )
    return isAnyFail
  }
  const pass = report.results.filter((r) => r.pass).length
  const total = report.results.length
  for (const r of report.results) {
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
  return isAnyFail
}

const runCheck = async (
  repos: string | undefined,
  options: { skipRemote: boolean; dir: string; json: boolean },
): Promise<void> => {
  if (!options.json) process.stdout.write(`\n  ${pc.bold('forge check')}\n\n`)

  if (!repos) {
    debug('checkLocal', process.cwd())
    const result = await checkLocal({ skipRemote: options.skipRemote })
    process.exit(printResults(result, options.json) ? 1 : 0)
  }

  const repoList = repos.split(',').map((r) => r.trim())
  let isAnyFail = false

  for (const repo of repoList) {
    if (!options.json)
      process.stdout.write(`  ${pc.dim('checking ' + repo + '…')}\n`)
    debug('checkRepo', repo)
    try {
      const result = await checkRepo(repo, {
        baseDir: options.dir,
        skipRemote: options.skipRemote,
      })
      if (printResults(result, options.json)) isAnyFail = true
    } catch (error) {
      debug(String(error))
      process.stderr.write(`  ${pc.red('✗ ' + repo + ' — could not clone')}\n`)
      isAnyFail = true
    }
  }

  process.exit(isAnyFail ? 1 : 0)
}

program
  .command('check')
  .description('audit repo(s) against forge standards')
  .option(
    '--repos <repos>',
    'comma-separated list of repos (default: current repo)',
  )
  .option('--skip-remote', 'skip secret checks', false)
  .option('--dir <dir>', 'cache dir for cloned repos', DEFAULT_DIR)
  .option('--json', 'output results as JSON', false)
  .action(
    (options: {
      repos?: string
      skipRemote: boolean
      dir: string
      json: boolean
    }) => runCheck(options.repos, options),
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
  spawnSync(
    'gh',
    ['secret', 'set', s.name, '--repo', repo, '--body', value.trim()],
    { stdio: 'ignore' },
  )
  log.success(`${s.name} set.`)
}

const REQUIRED_SECRETS = (repo: string) => [
  { name: 'NPM_TOKEN', desc: 'npm publish token (same for all repos)' },
  {
    name: 'CODACY_PROJECT_TOKEN',
    desc: `Codacy project token — find at app.codacy.com/gh/${repo}/settings/coverage`,
  },
]

const detectRepo = (): string | undefined => {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) return undefined
  const url = result.stdout.trim()
  const match = /github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url)
  return match?.[1]
}

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

    if (spawnSync('gh', ['--version'], { stdio: 'ignore' }).status !== 0) {
      log.error('gh CLI not found — install at https://cli.github.com')
      process.exit(1)
    }

    let existing: string[]
    try {
      debug('gh secret list --repo', repo)
      const result = spawnSync(
        'gh',
        ['secret', 'list', '--repo', repo, '--json', 'name'],
        { encoding: 'utf8' },
      )
      if (result.status !== 0) throw new Error(result.stderr)
      existing = (JSON.parse(result.stdout) as { name: string }[]).map(
        (s) => s.name,
      )
    } catch {
      log.error('Failed to list secrets. Run: gh auth login')
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

const SYNC_FILES: { src: string; dest: string }[] = [
  { src: 'template/.editorconfig', dest: '.editorconfig' },
  { src: 'template/.codacy.yml', dest: '.codacy.yml' },
  { src: 'template/lefthook.yml', dest: 'lefthook.yml' },
]

const RAW_BASE = 'https://raw.githubusercontent.com/lzear/forge/main'

program
  .command('sync')
  .description('sync template files from forge into this repo')
  .option('--dry', 'print what would change, do not write', false)
  .action(async (options: { dry: boolean }) => {
    log.intro(pc.bold('forge sync'))
    let isAnyFail = false
    for (const { src, dest } of SYNC_FILES) {
      const url = `${RAW_BASE}/${src}`
      const destinationPath = path.join(process.cwd(), dest)
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const content = await res.text()
        if (options.dry) log.success(`${dest} ${pc.dim('(dry)')}`)
        else {
          await mkdir(path.dirname(destinationPath), { recursive: true })
          await writeFile(destinationPath, content, 'utf8')
          log.success(dest)
        }
      } catch (error) {
        log.error(`${dest} — ${String(error)}`)
        isAnyFail = true
      }
    }
    log.outro(isAnyFail ? pc.red('Done with errors.') : pc.green('Done.'))
    if (isAnyFail) process.exit(1)
  })

const handleSignal = () => {
  if (isTTY) clack.cancel('Cancelled.')
  process.exit(130)
}
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)

program.parse()
