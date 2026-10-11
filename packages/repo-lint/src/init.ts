import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { coerce } from 'semver'
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
  latestPackageManager,
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
  /**
  whether the dev dependencies are listed and installed, so `forge check` can
  run
  */
  isInstalled: boolean
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
  /**
  the `packageManager` field to add, skipping the registry lookup; `null`
  adds none
  */
  packageManagerField?: string | null
}

type Context = {
  dir: string
  isLib: boolean
  isReact: boolean
  pm: 'bun' | 'yarn'
  pmField: string | null
  isDry: boolean
  /**
  the range of `@lzear/*` packages, from the forge version
  */
  forgeRange: string
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

const runner = (pm: 'bun' | 'yarn'): string =>
  pm === 'bun' ? 'bun run' : 'yarn'

const scriptsFor = ({
  isLib,
  isReact,
  pm,
}: Context): Record<string, string> => {
  const run = runner(pm)
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

// a placeholder package-json/no-empty-fields accepts; a next step flags it
const LOREM = 'Lorem ipsum dolor sit amet.'

// eslint-package-json's `fieldOrder`, which package-json/sort-properties follows
const FIELD_ORDER = [
  'name',
  'version',
  'private',
  'description',
  'license',
  'repository',
  'homepage',
  'bugs',
  'funding',
  'author',
  'authors',
  'contributors',
  'maintainers',
  'type',
  'exports',
  'imports',
  'main',
  'module',
  'browser',
  'types',
  'typings',
  'bin',
  'man',
  'directories',
  'sideEffects',
  'engines',
  'devEngines',
  'os',
  'cpu',
  'publishConfig',
  'packageManager',
  'scripts',
  'config',
  'files',
  'workspaces',
  'keywords',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundledDependencies',
  'bundleDependencies',
  'overrides',
]

const rank = (key: string): number => {
  const index = FIELD_ORDER.indexOf(key)
  return index === -1 ? FIELD_ORDER.length : index
}

// known fields in that order, then the others as they were
const sortFields = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data).toSorted(([a], [b]) => rank(a) - rank(b)),
  )

// what package-json/* wants of a published package; `exports` is tsdown's output
const LIB_FIELDS = {
  version: '0.0.0',
  description: LOREM,
  keywords: ['lorem', 'ipsum'],
  license: 'MIT',
  sideEffects: false,
  exports: {
    '.': { types: './dist/index.d.mts', default: './dist/index.mjs' },
  },
  files: ['dist'],
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
  const fields: Record<string, unknown> = {
    ...(context.isLib ? LIB_FIELDS : { private: true }),
    type: 'module',
    // forge's floor
    engines: { node: '>=24' },
    // before install, no lockfile tells forge check the manager
    ...(context.pmField && { packageManager: context.pmField }),
  }
  const scripts = scriptsFor(context)
  if (!existsSync(f)) {
    const package_ = { name: path.basename(context.dir), ...fields, scripts }
    const content = JSON.stringify(sortFields(package_), null, 2)
    return writeNew(context, file, `${content}\n`)
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
  json.data = sortFields({
    ...json.data,
    ...addedFields,
    scripts: { ...current, ...addedScripts },
  })
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
  const run = runner(context.pm)
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

// forge's own ranges (init.test.ts keeps them in sync), majors only as
// lzear/major-version-only wants
const DEV_RANGES: Record<string, string> = {
  lefthook: '^2',
  '@commitlint/cli': '^21',
  eslint: '^10',
  // typescript-eslint needs TS 6's JS API; `tsc` runs TS 7
  typescript: 'npm:@typescript/typescript6@^6',
  '@typescript/native': 'npm:typescript@^7',
  vitest: '^5',
  '@vitest/coverage-v8': '^5',
  // Vitest's peer, which Yarn doesn't install
  vite: '^8',
  tsdown: '^0.23',
  '@changesets/cli': '^3',
  jsdom: '~30',
}

// `^5`, or `^0.23` for 0.x; any version when unknown
const caretRange = (version: string | undefined): string => {
  const parsed = coerce(version)
  if (!parsed) return '*'
  return parsed.major === 0 ? `^0.${parsed.minor}` : `^${parsed.major}`
}

const devDependencies = ({ isLib, isReact, pm }: Context): string[] => [
  '@lzear/forge',
  'lefthook',
  '@commitlint/cli',
  'eslint',
  'typescript',
  '@typescript/native',
  'vitest',
  '@vitest/coverage-v8',
  'vite',
  ...(isLib ? ['tsdown'] : []),
  ...(isLib && pm === 'yarn' ? ['@lzear/configs', '@changesets/cli'] : []),
  ...(isReact ? ['jsdom'] : []),
]

// `name@range`, quoted for shells that glob `^` and `~`
const missingDependencies = (context: Context): string[] => {
  const package_ = readPackage(context.dir)
  const listed = new Set(
    ['dependencies', 'devDependencies'].flatMap((field) =>
      Object.keys((package_?.[field] ?? {}) as Record<string, string>),
    ),
  )
  return devDependencies(context)
    .filter((name) => !listed.has(name))
    .map((name) => `'${name}@${DEV_RANGES[name] ?? context.forgeRange}'`)
}

// checks need the dev deps' bins and a lockfile
const hasInstalled = ({ dir }: Context, missing: string[]): boolean =>
  missing.length === 0 && existsSync(path.join(dir, 'node_modules'))

const nextSteps = (
  context: Context,
  missing: string[],
  repo: string,
  release: ForgeRelease | null,
): string[] => {
  const { isLib, pm } = context
  const isRelease = isLib && pm === 'yarn'
  const isInstalled = hasInstalled(context, missing)
  const description = readPackage(context.dir)?.description
  return [
    ...(missing.length > 0 ? [`${pm} add -D ${missing.join(' ')}`] : []),
    ...(!isInstalled && missing.length === 0 ? [`${pm} install`] : []),
    ...(isRelease ? ['yarn changeset init'] : []),
    ...(context.pmField === null &&
    readPackage(context.dir)?.packageManager === undefined
      ? [`registry unreachable: set packageManager to ${pm}@<version>`]
      : []),
    ...(isLib && (description === undefined || description === LOREM)
      ? ['package.json: replace the lorem ipsum description and keywords']
      : []),
    ...(release
      ? []
      : ['forge tags unreachable, workflows on @main: forge check --fix']),
    'optional: add the repo on app.codacy.com, then `gh secret set CODACY_PROJECT_TOKEN`',
    ...(isRelease
      ? [`npm trusted publisher: ${repo} / main.yml, once the package exists`]
      : []),
    ...(isLib && pm === 'bun'
      ? ['publish by hand: release.yml runs Yarn']
      : []),
    // attw packs the build
    ...(isInstalled
      ? []
      : [`${runner(pm)} build && ${runner(pm)} forge check --skip-remote`]),
  ]
}

// null when package.json has the field already, or the registry is unreachable
const resolvePackageManagerField = async (
  options: InitOptions,
  { dir, pm }: { dir: string; pm: 'bun' | 'yarn' },
): Promise<string | null> => {
  if (options.packageManagerField !== undefined)
    return options.packageManagerField
  return readPackage(dir)?.packageManager === undefined
    ? latestPackageManager(pm).catch(() => null)
    : null
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
`packageManager` (the newest past the age gate) and the fields lint wants,
tsconfig, ESLint, Vitest and commitlint configs, `renovate.json`, the CI (and,
for a Yarn library, release) workflow pinned to a forge release, `.gitignore`,
LICENSE and badged README (libraries), the release-age gate, a `src/index.ts`
and its test when `src/` is missing, then {@linkcode syncTemplates}.

@param options `dir` defaults to the cwd, `dry` writes nothing
*/
export const initRepo = async (
  options: InitOptions = {},
): Promise<InitReport> => {
  const dir = options.dir ?? process.cwd()
  const pm =
    options.packageManager ??
    (detectPackageManager(dir).name === 'bun' ? 'bun' : 'yarn')
  const [release, pmField] = await Promise.all([
    resolveRelease(options, dir),
    resolvePackageManagerField(options, { dir, pm }),
  ])
  const context: Context = {
    dir,
    isLib: options.kind !== 'app',
    isReact: options.react ?? false,
    pm,
    pmField,
    isDry: options.dry ?? false,
    forgeRange: caretRange(options.version ?? release?.tag),
  }
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
    // a build entry and a test, which tsdown and Vitest fail without
    ...(existsSync(path.join(dir, 'src'))
      ? []
      : [
          await copy('src/index.ts', 'init/index'),
          await copy('src/index.test.ts', 'init/index.test'),
          // Vite's entry
          ...(context.isReact
            ? [await copy('index.html', 'init/vite-index')]
            : []),
        ]),
    ...sync.results,
  ]
  return {
    dir,
    results,
    next: nextSteps(context, missing, repo, release),
    isInstalled: hasInstalled(context, missing),
  }
}
