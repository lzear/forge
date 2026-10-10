import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  type ForgeRelease,
  forgeRelease,
  latestForgeRelease,
  releaseAgeSetting,
  withReleaseAge,
} from './checks.ts'
import { detectRepo, gitUsername } from './git.ts'
import { readTemplate, type SyncResult, syncTemplates } from './templates.ts'
import {
  detectPackageManager,
  readJsonFile,
  readPackage,
  writeJsonFile,
} from './update.ts'

/**
Outcome of writing one file: `unchanged` when it already existed.
*/
export type InitResult = SyncResult & { detail?: string }

/**
What {@linkcode initRepo} wrote, and the steps left to the user.
*/
export type InitReport = {
  dir: string
  results: InitResult[]
  next: string[]
}

/**
Options for {@linkcode initRepo}.
*/
export type InitOptions = {
  dir?: string
  /**
  a published library (default), or a private app
  */
  kind?: 'lib' | 'app'
  react?: boolean
  /**
  defaults to Bun when detected, else Yarn
  */
  packageManager?: 'bun' | 'yarn'
  dry?: boolean
  /**
  forge version whose tag the workflows pin, else the latest release
  */
  version?: string
  /**
  the release to pin, skipping the tag lookup; `null` pins `main`
  */
  release?: ForgeRelease | null
}

type Context = {
  dir: string
  isLib: boolean
  isReact: boolean
  pm: 'bun' | 'yarn'
  isDry: boolean
}

// ${{ … }} (GitHub expressions) has spaces, so it never matches
const render = async (
  template: string,
  variables: Record<string, string>,
): Promise<string> => {
  const content = await readTemplate(template)
  return content.replaceAll(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => variables[key] ?? match,
  )
}

const writeNew = async (
  { dir, isDry }: Context,
  file: string,
  content: string,
): Promise<InitResult> => {
  const destination = path.join(dir, file)
  if (existsSync(destination)) return { file, status: 'unchanged' }
  if (!isDry) {
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, 'utf8')
  }
  return { file, status: 'created' }
}

const scriptsFor = ({
  isLib,
  isReact,
  pm,
}: Context): Record<string, string> => {
  const run = pm === 'bun' ? 'bun run' : 'yarn'
  const steps = ['build', 'typecheck', 'lint', 'test', 'forge check']
  return {
    build: isLib ? 'tsdown' : isReact ? 'vite build' : 'tsc',
    typecheck: 'tsc --noEmit',
    lint: 'eslint .',
    test: 'vitest run',
    qa: steps.map((s) => `${run} ${s}`).join(' && '),
    // Bun runs lefthook's postinstall; Yarn repos turn dependency scripts off
    ...(pm === 'yarn' && { prepare: 'lefthook install' }),
  }
}

// the fields missing from `current`, picked from `wanted`
const pickMissing = <T>(
  wanted: Record<string, T>,
  current: Record<string, unknown>,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(wanted).filter(([key]) => current[key] === undefined),
  )

// adds the missing fields and scripts, creating package.json if needed
const writePackage = async (context: Context): Promise<InitResult> => {
  const file = 'package.json'
  const f = path.join(context.dir, file)
  const fields: Record<string, unknown> = context.isLib
    ? { version: '0.0.0', license: 'MIT' }
    : { private: true }
  const scripts = scriptsFor(context)
  if (!existsSync(f)) {
    const package_ = {
      name: path.basename(context.dir),
      ...fields,
      type: 'module',
      scripts,
    }
    return writeNew(context, file, `${JSON.stringify(package_, null, 2)}\n`)
  }
  const json = readJsonFile(f)
  const current = (json.data.scripts ?? {}) as Record<string, string>
  const addedFields = pickMissing(fields, json.data)
  const addedScripts = pickMissing(scripts, current)
  const fieldNames = Object.keys(addedFields)
  const scriptNames = Object.keys(addedScripts)
  const detail = [
    fieldNames.length > 0 ? `+ ${fieldNames.join(', ')}` : '',
    scriptNames.length > 0 ? `scripts: + ${scriptNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  if (!detail) return { file, status: 'unchanged' }
  Object.assign(json.data, addedFields)
  json.data.scripts = { ...current, ...addedScripts }
  if (!context.isDry) writeJsonFile(f, json)
  return { file, status: 'updated', detail }
}

// adds the gate unless the key is set; Yarn's file starts with node_modules,
// which forge's hooks and checks run bins from
const writeReleaseAge = async ({
  dir,
  pm,
  isDry,
}: Context): Promise<InitResult> => {
  const { file, key, line } = releaseAgeSetting(pm)
  const f = path.join(dir, file)
  const isNew = !existsSync(f)
  const config = isNew
    ? pm === 'yarn'
      ? 'nodeLinker: node-modules\n'
      : ''
    : readFileSync(f, 'utf8')
  if (new RegExp(String.raw`^${key}\s*[=:]`, 'm').test(config))
    return { file, status: 'unchanged' }
  if (!isDry) await writeFile(f, withReleaseAge(config, pm), 'utf8')
  return { file, status: isNew ? 'created' : 'updated', detail: line }
}

const RELEASE_JOB = '\n  release:\n'

const writeWorkflow = async (
  context: Context,
  release: ForgeRelease | null,
): Promise<InitResult> => {
  const run = context.pm === 'bun' ? 'bun run' : 'yarn'
  const content = await render('init/main.yml', {
    sha: release?.sha ?? 'main',
    tag: release?.tag ?? 'unpinned',
    coverage: `${run} test --coverage`,
  })
  // forge's release workflow runs Changesets on Yarn
  const isRelease = context.isLib && context.pm === 'yarn'
  const workflow = isRelease
    ? content
    : `${content.slice(0, content.indexOf(RELEASE_JOB)).trimEnd()}\n`
  return writeNew(context, '.github/workflows/main.yml', workflow)
}

// package.json's `author` (minus email and url), else git's user
const authorOf = (dir: string, owner: string): string => {
  const author = readPackage(dir)?.author
  return typeof author === 'string'
    ? (author.split(/ [<(]/, 1)[0] ?? author)
    : (gitUsername(dir) ?? owner)
}

const devDependencies = ({ isLib, isReact, pm }: Context): string[] => [
  '@lzear/forge',
  'lefthook',
  '@commitlint/cli',
  'eslint',
  'typescript',
  'vitest',
  '@vitest/coverage-v8',
  ...(isLib ? ['tsdown'] : []),
  ...(isLib && pm === 'yarn' ? ['@lzear/configs', '@changesets/cli'] : []),
  ...(isReact ? ['jsdom'] : []),
  ...(isReact && !isLib ? ['vite'] : []),
]

const missingDependencies = (context: Context): string[] => {
  const package_ = readPackage(context.dir)
  const listed = new Set(
    ['dependencies', 'devDependencies'].flatMap((field) =>
      Object.keys((package_?.[field] ?? {}) as Record<string, string>),
    ),
  )
  return devDependencies(context).filter((name) => !listed.has(name))
}

const nextSteps = (
  context: Context,
  missing: string[],
  repo: string,
  release: ForgeRelease | null,
): string[] => {
  const { isLib, pm } = context
  const isRelease = isLib && pm === 'yarn'
  return [
    ...(missing.length > 0 ? [`${pm} add -D ${missing.join(' ')}`] : []),
    ...(isRelease ? ['yarn changeset init'] : []),
    ...(release
      ? []
      : ['forge tags unreachable, workflows on @main: forge check --fix']),
    `Codacy: add ${repo} at https://app.codacy.com${isLib ? ', put its project id in the README badges (CODACY_PROJECT_ID)' : ''}`,
    'forge setup (CODACY_PROJECT_TOKEN secret)',
    ...(isRelease
      ? [`npm trusted publisher: ${repo} / main.yml, once the package exists`]
      : []),
    ...(isLib && pm === 'bun'
      ? ['publish by hand: release.yml runs Yarn']
      : []),
  ]
}

const resolveRelease = (
  options: InitOptions,
  dir: string,
): Promise<ForgeRelease | null> => {
  if (options.release !== undefined) return Promise.resolve(options.release)
  return options.version
    ? forgeRelease(options.version, dir)
    : latestForgeRelease(dir)
}

/**
Scaffolds a forge repo, writing only what is missing: package.json scripts,
tsconfig, ESLint, Vitest and commitlint configs, `renovate.json`, the CI (and,
for a Yarn library, release) workflow pinned to a forge release, `.gitignore`,
LICENSE and badged README (libraries), the release-age gate, then
{@linkcode syncTemplates}.

@param options `dir` defaults to the cwd, `dry` writes nothing
*/
export const initRepo = async (
  options: InitOptions = {},
): Promise<InitReport> => {
  const dir = options.dir ?? process.cwd()
  const context: Context = {
    dir,
    isLib: options.kind !== 'app',
    isReact: options.react ?? false,
    pm:
      options.packageManager ??
      (detectPackageManager(dir).name === 'bun' ? 'bun' : 'yarn'),
    isDry: options.dry ?? false,
  }
  const release = await resolveRelease(options, dir)
  const missing = missingDependencies(context)
  const packageName = readPackage(dir)?.name
  const name =
    typeof packageName === 'string' ? packageName : path.basename(dir)
  const repo = detectRepo(dir) ?? `lzear/${path.basename(dir)}`
  const variables = {
    name,
    repo,
    year: String(new Date().getFullYear()),
    author: authorOf(dir, repo.split('/', 1)[0] ?? ''),
    tsconfig: context.isReact ? 'react' : context.isLib ? 'lib' : 'app',
    vitest: context.isReact ? 'vitest/react' : 'vitest',
  }
  const copy = async (file: string, template: string): Promise<InitResult> =>
    writeNew(context, file, await render(template, variables))
  const readme = await render('init/README.md', variables)
  const sync = await syncTemplates({ dir, dry: context.isDry })

  const results = [
    await writePackage(context),
    await copy('tsconfig.json', 'init/tsconfig'),
    await copy('eslint.config.ts', 'init/eslint.config'),
    await copy('vitest.config.ts', 'init/vitest.config'),
    await copy('commitlint.config.ts', 'init/commitlint.config'),
    await copy('renovate.json', 'init/renovate.json'),
    await writeWorkflow(context, release),
    await copy('.gitignore', 'init/gitignore'),
    ...(context.isLib ? [await copy('LICENSE', 'init/LICENSE')] : []),
    await writeNew(
      context,
      'README.md',
      context.isLib ? readme : `${readme.split('\n', 1)[0] ?? ''}\n`,
    ),
    await writeReleaseAge(context),
    ...sync.results,
  ]
  return { dir, results, next: nextSteps(context, missing, repo, release) }
}
