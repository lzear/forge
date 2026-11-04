#!/usr/bin/env node

/**
The `forge` CLI: `init`, `check`, `update` and `sync`.

```sh
npx @lzear/forge check
```

@module
*/

import { createRequire } from 'node:module'
import { parseArgs, type ParseArgsOptionDescriptor, styleText } from 'node:util'
import { isAgent } from 'std-env'
import {
  checkLocal,
  type CheckResult,
  initRepo,
  type InitReport,
  type PackageManager,
  type RepoReport,
  runUpdate,
  type SyncReport,
  type SyncStatus,
  syncTemplates,
  UPDATE_STEPS,
  type UpdateReport,
  type UpdateResult,
} from '@lzear/repo-lint'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const isTTY = process.stdout.isTTY
const isDebug = process.env.DEBUG?.includes('forge') ?? false

const debug = (...arguments_: unknown[]) => {
  if (isDebug)
    console.error(
      styleText('dim', `[debug] ${arguments_.join(' ')}`, {
        stream: process.stderr,
      }),
    )
}

const write = (text: string) => process.stdout.write(`${text}\n`)
const guided = (mark: string, message: string) =>
  write(`${styleText('gray', '│')}\n${mark}  ${message}`)

const log = {
  intro: (message: string) => {
    write(isTTY ? `${styleText('gray', '┌')}  ${message}` : message)
  },
  outro: (message: string) => {
    if (isTTY) guided(styleText('gray', '└'), `${message}\n`)
    else console.log(message)
  },
  success: (message: string) => {
    if (isTTY) guided(styleText('green', '◆'), message)
    else console.log(`✓ ${message}`)
  },
  error: (message: string) => {
    if (isTTY) guided(styleText('red', '■'), message)
    else console.error(`✗ ${message}`)
  },
  warn: (message: string) => {
    if (isTTY) guided(styleText('yellow', '▲'), message)
    else console.warn(`! ${message}`)
  },
}

const fail = (message: string): never => {
  process.stderr.write(`error: ${message}\n`)
  return process.exit(1)
}

type Flag = ParseArgsOptionDescriptor & {
  help: string
  // the value's name in help
  value?: string
  // a flag this one cannot be used with
  conflicts?: string
}
type Flags = Record<string, Flag>
type ParseConfig<F extends Flags> = { args: string[]; options: F }
type Values<F extends Flags> = ReturnType<
  typeof parseArgs<ParseConfig<F>>
>['values']

type Command = {
  name: string
  description: string
  flags: Flags
  run: (arguments_: string[]) => Promise<void>
}

const HELP_FLAG: Flag = { type: 'boolean', short: 'h', help: 'show help' }

const flagTerm = (name: string, { short, value }: Flag): string => {
  const flag = short ? `-${short}, --${name}` : `--${name}`
  return value ? `${flag} <${value}>` : flag
}

const wrap = (text: string, width: number): string[] => {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && `${last} ${word}`.length <= width)
      lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

const helpWidth = (): number => process.stdout.columns || 80

const helpRows = (rows: [string, string][], pad: number): string => {
  const indent = ' '.repeat(pad + 4)
  const newline = `\n${indent}`
  return rows
    .map(([term, text]) => {
      const lines = wrap(text, helpWidth() - indent.length)
      return `  ${term.padEnd(pad)}  ${lines.join(newline)}`
    })
    .join('\n')
}

const flagRows = (flags: Flags): [string, string][] =>
  Object.entries({ ...flags, help: HELP_FLAG }).map(([name, flag]) => [
    flagTerm(name, flag),
    flag.default === undefined
      ? flag.help
      : `${flag.help} (default: ${String(flag.default)})`,
  ])

const commandHelp = ({ name, description, flags }: Command): string => {
  const rows = flagRows(flags)
  const pad = Math.max(...rows.map(([term]) => term.length))
  return `Usage: forge ${name} [options]

${wrap(description, helpWidth()).join('\n')}

Options:
${helpRows(rows, pad)}
`
}

type OptionToken = {
  name: string
  rawName: string
  value?: string | undefined
  inlineValue?: boolean | undefined
}

const optionError = (
  flags: Flags,
  { name, rawName, value, inlineValue }: OptionToken,
): string | undefined => {
  const flag = flags[name]
  if (!flag || (inlineValue && flag.type === 'boolean')) {
    const raw = inlineValue ? `${rawName}=${value}` : rawName
    return `unknown option '${raw}'`
  }
  const isMissing =
    flag.type === 'string' &&
    (value === undefined || (!inlineValue && value.startsWith('-')))
  return isMissing
    ? `option '${flagTerm(name, flag)}' argument missing`
    : undefined
}

const argumentError = (
  name: string,
  flags: Flags,
  options: OptionToken[],
  positionals: string[],
): string | undefined => {
  const optionFailure = options
    .map((option) => optionError(flags, option))
    .find(Boolean)
  if (optionFailure) return optionFailure
  if (positionals.length > 0)
    return `too many arguments for '${name}'. Expected 0 arguments but got ${positionals.length}: ${positionals.join(', ')}.`
  const used = new Set(options.map((option) => option.name))
  const conflict = Object.entries(flags).find(
    ([key, { conflicts }]) =>
      used.has(key) && conflicts !== undefined && used.has(conflicts),
  )
  return conflict
    ? `option '--${conflict[0]}' cannot be used with option '--${conflict[1].conflicts}'`
    : undefined
}

const command = <const F extends Flags>(
  name: string,
  description: string,
  flags: F,
  action: (values: Values<F>) => Promise<void>,
): Command => {
  const self: Command = {
    name,
    description,
    flags,
    run: async (arguments_) => {
      const { positionals, tokens } = parseArgs({
        args: arguments_,
        options: { ...flags, help: HELP_FLAG },
        strict: false,
        tokens: true,
      })
      const options = tokens.filter((token) => token.kind === 'option')
      if (options.some((option) => option.name === 'help')) {
        process.stdout.write(commandHelp(self))
        return
      }
      const error = argumentError(name, flags, options, positionals)
      if (error) fail(error)
      await action(
        parseArgs<ParseConfig<F>>({ args: arguments_, options: flags }).values,
      )
    },
  }
  return self
}

const printFixes = (fixed: NonNullable<RepoReport['fixed']>): void => {
  for (const f of fixed) {
    const mark = f.pass ? styleText('cyan', '⚒') : styleText('red', '✗')
    const label = styleText('dim', f.pass ? '(fixed)' : '(fix failed)')
    process.stdout.write(`  ${mark}  ${f.desc} ${label}\n`)
    const lines = f.detail?.split('\n') ?? []
    for (const line of lines)
      process.stdout.write(`       ${styleText('dim', line)}\n`)
  }
  if (fixed.length > 0) process.stdout.write('\n')
}

const resultMark = (r: CheckResult, isStrict: boolean): string => {
  if (r.pass) return styleText('green', '✓')
  return !isStrict && r.drift ? styleText('yellow', '!') : styleText('red', '✗')
}

const printSummary = (report: RepoReport, isStrict: boolean): void => {
  const pass = report.results.filter((r) => r.pass).length
  const total = report.results.length
  const drifted = isStrict
    ? 0
    : report.results.filter((r) => !r.pass && r.drift).length
  for (const r of report.results) {
    // agents re-read tool output every turn: passes would only cost tokens
    if (isAgent && r.pass) continue
    process.stdout.write(`  ${resultMark(r, isStrict)}  ${r.desc}\n`)
    if (!r.pass && r.detail)
      for (const line of r.detail.split('\n'))
        process.stdout.write(`       ${styleText('dim', line)}\n`)
  }
  const score = styleText(
    pass === total ? 'green' : 'yellow',
    `${pass}/${total}`,
  )
  const drift =
    drifted > 0 ? ', ' + styleText('yellow', `${drifted} drifted`) : ''
  process.stdout.write(`\n  ${score} checks passed${drift}\n`)
  const skipped = `${report.skipped.length} skipped`
  if (!isAgent && report.skipped.length > 0)
    process.stdout.write(`  ${styleText('dim', skipped)}\n`)
}

// whether the run fails: drift only counts when strict
const printResults = (
  report: RepoReport,
  json: boolean,
  isStrict = false,
): boolean => {
  if (json) {
    console.log(
      JSON.stringify(
        {
          repo: report.repo,
          results: report.results,
          skipped: report.skipped,
          ...(report.fixed && { fixed: report.fixed }),
          pass: report.pass,
        },
        null,
        2,
      ),
    )
    return !report.pass
  }
  if (report.fixed) printFixes(report.fixed)
  printSummary(report, isStrict)
  return !report.pass
}

const splitIds = (value: string): string[] =>
  value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

const check = command(
  'check',
  'audit the current repo against forge standards',
  {
    'skip-remote': {
      type: 'boolean',
      default: false,
      help: 'skip GitHub checks (gh)',
    },
    only: {
      type: 'string',
      value: 'ids',
      help: 'run only these checks (comma-separated)',
    },
    skip: {
      type: 'string',
      value: 'ids',
      help: 'skip these checks (comma-separated)',
    },
    fix: { type: 'boolean', help: 'fix failures, then check again' },
    strict: {
      type: 'boolean',
      help: 'fail on drift too (new releases, advisories)',
    },
    json: { type: 'boolean', default: false, help: 'output results as JSON' },
  },
  async ({ 'skip-remote': skipRemote, only, skip, fix, strict, json }) => {
    if (!json)
      process.stdout.write(`\n  ${styleText('bold', 'forge check')}\n\n`)
    debug('checkLocal', process.cwd())
    let result: RepoReport
    try {
      result = await checkLocal({
        skipRemote,
        ...(only && { only: splitIds(only) }),
        ...(skip && { skip: splitIds(skip) }),
        ...(fix && { fix }),
        ...(strict && { strict }),
      })
    } catch (error) {
      log.error(Error.isError(error) ? error.message : String(error))
      process.exit(1)
    }
    // exit() would cut a piped stdout past 64 KB
    process.exitCode = printResults(result, json, strict) ? 1 : 0
  },
)

const formatPackageManager = (pm: PackageManager): string => {
  const version = pm.version ? `@${pm.version}` : ''
  return `package manager: ${pm.name}${version} (${pm.source})`
}

const updateMark = (r: UpdateResult): string => {
  if (!r.pass) return styleText('red', '✗')
  return r.changed ? styleText('yellow', '↑') : styleText('green', '✓')
}

const printUpdateReport = (report: UpdateReport): void => {
  process.stdout.write(
    `  ${styleText('dim', formatPackageManager(report.packageManager))}\n\n`,
  )
  for (const r of report.results) {
    process.stdout.write(`  ${updateMark(r)}  ${r.desc}\n`)
    if (r.detail && (r.changed || !r.pass))
      for (const line of r.detail.split('\n'))
        process.stdout.write(`       ${styleText('dim', line)}\n`)
  }
  process.stdout.write('\n')
}

const update = command(
  'update',
  'update dependencies, packageManager, runtime version files, GitHub Actions pins and the LICENSE year',
  {
    dry: {
      type: 'boolean',
      default: false,
      help: 'preview changes, do not write',
    },
    'no-install': { type: 'boolean', help: 'skip install & lockfile refresh' },
    only: {
      type: 'string',
      value: 'ids',
      help: `run only these steps (comma-separated: ${UPDATE_STEPS.join(', ')})`,
    },
    skip: {
      type: 'string',
      value: 'ids',
      help: 'skip these steps (comma-separated)',
    },
    json: { type: 'boolean', default: false, help: 'output results as JSON' },
  },
  async ({ dry: isDry, 'no-install': noInstall, only, skip, json: isJson }) => {
    if (!isJson)
      process.stdout.write(
        `\n  ${styleText('bold', 'forge update')}${isDry ? styleText('dim', ' (dry run)') : ''}\n\n`,
      )
    debug('runUpdate', process.cwd())
    let report: UpdateReport
    try {
      report = await runUpdate({
        dry: isDry,
        install: !noInstall,
        ...(only && { only: splitIds(only) }),
        ...(skip && { skip: splitIds(skip) }),
      })
    } catch (error) {
      log.error(Error.isError(error) ? error.message : String(error))
      process.exit(1)
    }
    const isAnyFail = report.results.some((r) => !r.pass)
    if (isJson)
      console.log(JSON.stringify({ ...report, pass: !isAnyFail }, null, 2))
    else printUpdateReport(report)
    process.exitCode = isAnyFail ? 1 : 0
  },
)

const SYNC_LABELS: Record<SyncStatus, [string, string]> = {
  unchanged: ['(unchanged)', '(unchanged)'],
  created: ['(created)', '(would create)'],
  updated: ['(updated)', '(would update)'],
}

const sync = command(
  'sync',
  'write the template files bundled with this forge version',
  {
    dry: {
      type: 'boolean',
      default: false,
      help: 'print what would change, do not write',
    },
    check: {
      type: 'boolean',
      default: false,
      help: 'exit 1 when a file drifted, do not write',
    },
  },
  async ({ dry, check: isCheck }) => {
    const isDry = dry || isCheck
    log.intro(styleText('bold', 'forge sync'))
    let report: SyncReport
    try {
      report = await syncTemplates({ dry: isDry })
    } catch (error) {
      log.error(String(error))
      log.outro(styleText('red', 'Done with errors.'))
      process.exit(1)
    }
    for (const { file, status } of report.results) {
      const line = `${file} ${styleText('dim', SYNC_LABELS[status][isDry ? 1 : 0])}`
      if (isDry && status !== 'unchanged') log.warn(line)
      else log.success(line)
    }
    const isDrift =
      isCheck && report.results.some((r) => r.status !== 'unchanged')
    log.outro(
      isDrift
        ? styleText('red', 'Drifted. Run: forge sync')
        : styleText('green', 'Done.'),
    )
    if (isDrift) process.exitCode = 1
  },
)

const INIT_LABELS: Record<SyncStatus, [string, string]> = {
  unchanged: ['(exists)', '(exists)'],
  created: ['(created)', '(would create)'],
  updated: ['(updated)', '(would update)'],
}

const printInitReport = (report: InitReport, isDry: boolean): void => {
  for (const { file, status, detail } of report.results) {
    const label = styleText('dim', INIT_LABELS[status][isDry ? 1 : 0])
    const mark =
      status === 'unchanged' ? styleText('dim', '·') : styleText('cyan', '⚒')
    process.stdout.write(`  ${mark}  ${file} ${label}\n`)
    const lines = detail?.split('\n') ?? []
    for (const line of lines)
      process.stdout.write(`       ${styleText('dim', line)}\n`)
  }
  process.stdout.write(`\n  ${styleText('bold', 'Next')}\n`)
  for (const step of report.next) process.stdout.write(`  →  ${step}\n`)
}

const init = command(
  'init',
  'scaffold the missing forge files, then check once installed',
  {
    lib: { type: 'boolean', help: 'a published library (default)' },
    app: { type: 'boolean', help: 'a private app', conflicts: 'lib' },
    bun: { type: 'boolean', help: 'Bun (default when bun.lock exists)' },
    yarn: { type: 'boolean', help: 'Yarn', conflicts: 'bun' },
    dry: {
      type: 'boolean',
      default: false,
      help: 'print what would be written, do not write',
    },
  },
  async ({ app, bun, yarn, dry: isDry }) => {
    process.stdout.write(
      `\n  ${styleText('bold', 'forge init')}${isDry ? styleText('dim', ' (dry run)') : ''}\n\n`,
    )
    const packageManager = bun ? 'bun' : yarn && 'yarn'
    const report = await initRepo({
      kind: app ? 'app' : 'lib',
      ...(packageManager && { packageManager }),
      dry: isDry,
      version,
    })
    printInitReport(report, isDry)
    // without the dev deps, the check would fail; the report's last step runs it
    if (isDry || !report.isInstalled) return
    process.stdout.write(
      `\n  ${styleText('bold', 'forge check --skip-remote')}\n\n`,
    )
    const result = await checkLocal({ skipRemote: true })
    process.exitCode = printResults(result, false) ? 1 : 0
  },
)

const COMMANDS = [check, update, sync, init]

const rootHelp = (): string => {
  const options: [string, string][] = [
    ['-v, --version', 'output the version number'],
    ['-h, --help', 'show help'],
  ]
  const commands: [string, string][] = [
    ...COMMANDS.map(({ name, description }): [string, string] => [
      `${name} [options]`,
      description,
    ]),
    ['help [command]', 'display help for command'],
  ]
  const pad = Math.max(
    ...[...options, ...commands].map(([term]) => term.length),
  )
  return `Usage: forge [options] [command]

lzear repo tooling

Options:
${helpRows(options, pad)}

Commands:
${helpRows(commands, pad)}
`
}

const findCommand = (name: string | undefined): Command | undefined =>
  COMMANDS.find((c) => c.name === name)

const showHelp = (name: string | undefined): void => {
  const found = findCommand(name)
  if (found) process.stdout.write(commandHelp(found))
  else if (name === undefined) process.stdout.write(rootHelp())
  else {
    process.stderr.write(rootHelp())
    process.exit(1)
  }
}

const main = async ([name, ...rest]: string[]): Promise<void> => {
  if (name === undefined) {
    process.stderr.write(rootHelp())
    process.exit(1)
  }
  if (name === '-v' || name === '--version') {
    write(version)
    return
  }
  if (name === '-h' || name === '--help') {
    process.stdout.write(rootHelp())
    return
  }
  if (name === 'help') {
    showHelp(rest[0])
    return
  }
  if (name.startsWith('-')) fail(`unknown option '${name}'`)
  const found = findCommand(name)
  if (!found) return fail(`unknown command '${name}'`)
  await found.run(rest)
}

const handleSignal = () => {
  if (isTTY)
    write(`${styleText('gray', '└')}  ${styleText('red', 'Cancelled.')}\n`)
  process.exit(130)
}
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)

await main(process.argv.slice(2))
