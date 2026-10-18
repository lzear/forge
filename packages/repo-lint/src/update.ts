import { Buffer } from 'node:buffer'
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { run as ncuRun } from 'npm-check-updates'
import { coerce, compare, gt, maxSatisfying } from 'semver'

/**
Package managers `forge update` can install with.
*/
export type PackageManagerName = 'npm' | 'yarn' | 'pnpm' | 'bun'

/**
A detected package manager and where it was detected from.
*/
export type PackageManager = {
  name: PackageManagerName
  version?: string
  source: 'packageManager' | 'lockfile' | 'default'
}

/**
Outcome of one update step.
*/
export type UpdateResult = {
  id: string
  desc: string
  pass: boolean
  changed: boolean
  detail?: string
}

/**
All update step results for one directory.
*/
export type UpdateReport = {
  dir: string
  packageManager: PackageManager
  results: UpdateResult[]
}

/**
The `forge update` steps, in the order they report.
*/
export const UPDATE_STEPS = [
  'deps',
  'package-manager',
  'node-version',
  'bun-version',
  'actions',
  'license-year',
  'install',
] as const

/**
An id of {@linkcode UPDATE_STEPS}.
*/
export type UpdateStepId = (typeof UPDATE_STEPS)[number]

/**
Options for {@linkcode runUpdate}.
*/
export type UpdateOptions = {
  dir?: string
  dry?: boolean
  /**
  `false` skips the install step
  */
  install?: boolean
  /**
  run only these step ids
  */
  only?: string[]
  /**
  skip these step ids
  */
  skip?: string[]
}

const LOCKFILES: [string, PackageManagerName][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const PM_FIELD_RE = /^(npm|yarn|pnpm|bun)@([^+\s]+)(\+\S+)?/

// matches the package manager's age gate, so ncu never picks a version the
// install then rejects; own packages skip both
export const MIN_RELEASE_AGE_DAYS = 3
const OWN_PACKAGE_RE = /^(?:@lzear\/|(?:votes|eslint-plugin-ninja)$)/
const cooldown = (name: string): number =>
  OWN_PACKAGE_RE.test(name) ? 0 : MIN_RELEASE_AGE_DAYS
const isOldEnough = (date: string): boolean =>
  Date.now() - Date.parse(date) >= MIN_RELEASE_AGE_DAYS * 86_400_000

type JsonFile = {
  data: Record<string, unknown>
  indent: string
  trailingNewline: boolean
}

export const readJsonFile = (file: string): JsonFile => {
  const raw = readFileSync(file, 'utf8')
  return {
    data: JSON.parse(raw) as Record<string, unknown>,
    indent: /^[ \t]+/m.exec(raw)?.[0] ?? '  ',
    trailingNewline: raw.endsWith('\n'),
  }
}

export const writeJsonFile = (file: string, json: JsonFile): void => {
  writeFileSync(
    file,
    JSON.stringify(json.data, null, json.indent) +
      (json.trailingNewline ? '\n' : ''),
    'utf8',
  )
}

export const readPackage = (dir: string): Record<string, unknown> | null => {
  const f = path.join(dir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

// pnpm-workspace.yaml's `packages:`, a flat list of (quoted) globs
const readPnpmPatterns = (dir: string): string[] => {
  const file = path.join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(file)) return []
  const patterns: string[] = []
  let isPackages = false
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*(?:#.*)?$/.test(line)) continue
    if (/^\S/.test(line)) isPackages = /^packages:\s*(?:#.*)?$/.test(line)
    else if (isPackages && line.trimStart().startsWith('-')) {
      const item = line.trim().slice(1).split('#', 1)[0]?.trim() ?? ''
      const pattern = /^(["'])(.*)\1$/.exec(item)?.[2] ?? item
      if (pattern) patterns.push(pattern)
    }
  }
  return patterns
}

/**
Workspace globs from `package.json` `workspaces` (array or `{ packages }`),
else, given the root `dir`, `pnpm-workspace.yaml`'s `packages:`.
*/
export const getWorkspacePatterns = (
  package_: Record<string, unknown>,
  dir?: string,
): string[] => {
  const ws = package_.workspaces
  if (Array.isArray(ws)) return ws as string[]
  const wsPackage = ws as Record<string, unknown> | undefined
  if (Array.isArray(wsPackage?.packages)) return wsPackage.packages as string[]
  return dir ? readPnpmPatterns(dir) : []
}

const globDirectories = (rootDir: string, patterns: string[]): string[] =>
  globSync(
    patterns.map((p) =>
      path.posix.normalize(p.endsWith('/') ? p.slice(0, -1) : p),
    ),
    {
      cwd: rootDir,
      exclude: (p) => path.basename(p) === 'node_modules',
    },
  )

/**
The workspace package directories, sorted: those the globs match (`!`
negations excluding) that hold a `package.json`.
*/
export const getWorkspaceDirectories = (rootDir: string): string[] => {
  const package_ = readPackage(rootDir)
  if (!package_) return []
  const patterns = getWorkspacePatterns(package_, rootDir)
  const excluded = new Set(
    globDirectories(
      rootDir,
      patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1)),
    ),
  )
  const included = globDirectories(
    rootDir,
    patterns.filter((p) => !p.startsWith('!')),
  ).filter(
    (d) =>
      !excluded.has(d) && existsSync(path.join(rootDir, d, 'package.json')),
  )
  return [...new Set(included)]
    .toSorted((a, b) => a.localeCompare(b))
    .map((d) => path.join(rootDir, d))
}

// ncu's names for the workspaces, or null when it may take them all: a git
// submodule's manifest is its own repo's to update
const ownWorkspaces = (dir: string): string[] | null => {
  const directories = getWorkspaceDirectories(dir)
  const own = directories.filter((d) => !existsSync(path.join(d, '.git')))
  if (own.length === directories.length) return null
  return own.map((d) => {
    const name = readPackage(d)?.name
    return typeof name === 'string' ? name : path.basename(d)
  })
}

/**
Detects the package manager from the `packageManager` field, then the
lockfile, defaulting to npm.
*/
export const detectPackageManager = (dir: string): PackageManager => {
  const field = readPackage(dir)?.packageManager
  const match = typeof field === 'string' ? PM_FIELD_RE.exec(field) : null
  if (match?.[1] && match[2])
    return {
      name: match[1] as PackageManagerName,
      version: match[2],
      source: 'packageManager',
    }

  for (const [file, name] of LOCKFILES)
    if (existsSync(path.join(dir, file))) return { name, source: 'lockfile' }
  return { name: 'npm', source: 'default' }
}

const fetchJson = async <T>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> => {
  const response = await fetch(url, headers && { headers })
  if (!response.ok) throw new Error(`GET ${url} — HTTP ${response.status}`)
  return (await response.json()) as T
}

type Spawned = {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

/**
`spawnSync`'s result without blocking the event loop, so steps and checks
overlap.
*/
export const run = (
  command: string,
  arguments_: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<Spawned> =>
  new Promise((resolve) => {
    execFile(
      command,
      arguments_,
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        // a numeric code is the exit status; anything else failed to spawn
        if (!error) resolve({ status: 0, stdout, stderr })
        else if (typeof error.code === 'number')
          resolve({ status: error.code, stdout, stderr })
        else resolve({ status: null, stdout, stderr, error })
      },
    )
  })

/**
Tag → commit of a git remote, from `git ls-remote --tags`; an annotated tag's
peeled `^{}` line gives its commit. `null` when unreachable.
*/
export const remoteTags = async (
  url: string,
  cwd: string,
): Promise<Map<string, string> | null> => {
  const r = await run('git', ['ls-remote', '--tags', url], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (r.status !== 0) return null
  const tags = new Map<string, string>()
  for (const line of r.stdout.split('\n')) {
    const match = /^([\da-f]{40})\trefs\/tags\/([^^]+)(\^\{\})?$/.exec(line)
    if (!match) continue
    const [, sha = '', tag = '', peeled] = match
    if (peeled || !tags.has(tag)) tags.set(tag, sha)
  }
  return tags
}

// yarn ≥2 is not published as `yarn` on npm (that package is stuck on 1.x);
// corepack resolves it from `@yarnpkg/cli-dist`.
const pmRegistryName = (
  name: PackageManagerName,
  currentMajor: number,
): string =>
  name === 'yarn' && currentMajor >= 2 ? '@yarnpkg%2Fcli-dist' : name

type Release = { version: string; integrity: string | undefined }

type Packument = {
  'dist-tags'?: { latest?: string }
  time?: Record<string, string>
  versions?: Record<string, { dist?: { integrity?: string } }>
}

// the newest version up to `latest` past the age gate, from the full packument
// (the abbreviated one has no publish times)
const gatedRelease = async (name: string): Promise<Release> => {
  const data = await fetchJson<Packument>(`https://registry.npmjs.org/${name}`)
  const latest = data['dist-tags']?.latest
  if (!latest) throw new TypeError(`no latest version for ${name}`)
  const time = data.time ?? {}
  const old = Object.keys(data.versions ?? {}).filter((v) => {
    const date = time[v]
    return date !== undefined && isOldEnough(date)
  })
  const version = maxSatisfying(old, `<=${latest}`)
  if (!version)
    throw new Error(
      `no ${name} release is ${MIN_RELEASE_AGE_DAYS} days old yet`,
    )
  return { version, integrity: data.versions?.[version]?.dist?.integrity }
}

/**
The `packageManager` field for a new repo: the newest Bun, or Yarn ≥ 2, past
the release-age gate, e.g. `yarn@4.10.3`.
*/
export const latestPackageManager = async (
  name: 'bun' | 'yarn',
): Promise<string> => {
  const { version } = await gatedRelease(pmRegistryName(name, 4))
  return `${name}@${version}`
}

// corepack's `+sha512.<hex>` from the packument's `sha512-<base64>`
const corepackHash = ({ version, integrity }: Release): string => {
  const [algorithm, digest] = integrity?.split('-', 2) ?? []
  if (algorithm !== 'sha512' || !digest)
    throw new Error(`no sha512 integrity for ${version}`)
  return `+sha512.${Buffer.from(digest, 'base64').toString('hex')}`
}

const NCURC_FILES = [
  '.ncurc.json',
  '.ncurc.js',
  '.ncurc.cjs',
  '.ncurc.mjs',
  '.ncurc',
]

// ncu's programmatic run() only loads .ncurc files in workspaces mode, so
// load the config ourselves to make `reject` & friends work everywhere.
const loadNcuRc = async (
  dir: string,
): Promise<{ file?: string; config: Record<string, unknown> }> => {
  for (const name of NCURC_FILES) {
    const file = path.join(dir, name)
    if (!existsSync(file)) continue
    if (name === '.ncurc' || name.endsWith('.json'))
      return {
        file: name,
        config: JSON.parse(readFileSync(file, 'utf8')) as Record<
          string,
          unknown
        >,
      }
    const module_ = (await import(pathToFileURL(file).href)) as {
      default?: Record<string, unknown>
    }
    return { file: name, config: module_.default ?? module_ }
  }
  return { config: {} }
}

export const stepDeps = async (
  dir: string,
  isDry: boolean,
): Promise<UpdateResult> => {
  const base = { id: 'deps', desc: 'dependency ranges (ncu)' }
  try {
    const isWorkspaces =
      getWorkspacePatterns(readPackage(dir) ?? {}, dir).length > 0
    const own = isWorkspaces ? ownWorkspaces(dir) : null
    const rc = await loadNcuRc(dir)
    const result = (await ncuRun({
      cooldown,
      ...rc.config,
      packageFile: path.join(dir, 'package.json'),
      cwd: dir,
      upgrade: !isDry,
      silent: true,
      dep: ['prod', 'dev', 'optional', 'peer'],
      ...(isWorkspaces && {
        root: true,
        ...(own ? { workspace: own } : { workspaces: true }),
      }),
    })) as Record<string, string | Record<string, string>>

    // keyed by package file in workspaces mode, flat for a lone package
    const entries = Object.entries(result).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v]] : Object.entries(v),
    )

    const rcNote = rc.file ? ` (using ${rc.file})` : ''
    if (entries.length === 0)
      return {
        ...base,
        pass: true,
        changed: false,
        detail: `up to date${rcNote}`,
      }
    return {
      ...base,
      pass: true,
      changed: true,
      detail: entries.map(([k, v]) => `${k}  →  ${v}`).join('\n') + rcNote,
    }
  } catch (error) {
    return { ...base, pass: false, changed: false, detail: String(error) }
  }
}

const stepPackageManager = async (
  dir: string,
  isDry: boolean,
): Promise<UpdateResult> => {
  const base = { id: 'package-manager', desc: 'packageManager field' }
  try {
    const file = path.join(dir, 'package.json')
    const json = readJsonFile(file)
    if (typeof json.data.packageManager !== 'string')
      return {
        ...base,
        pass: true,
        changed: false,
        detail: 'no packageManager field',
      }
    const match = PM_FIELD_RE.exec(json.data.packageManager)
    if (!match)
      return {
        ...base,
        pass: true,
        changed: false,
        detail: `unrecognized: ${json.data.packageManager}`,
      }
    const [, name, current, hash] = match as unknown as [
      string,
      PackageManagerName,
      string,
      string | undefined,
    ]
    const major = Number(current.split('.', 1)[0])
    const release = await gatedRelease(pmRegistryName(name, major))
    const latest = release.version
    if (!gt(latest, current))
      return {
        ...base,
        pass: true,
        changed: false,
        detail: `${name}@${current} is latest`,
      }
    json.data.packageManager = `${name}@${latest}${hash ? corepackHash(release) : ''}`
    if (!isDry) writeJsonFile(file, json)
    return {
      ...base,
      pass: true,
      changed: true,
      detail: `${name} ${current}  →  ${latest}`,
    }
  } catch (error) {
    return { ...base, pass: false, changed: false, detail: String(error) }
  }
}

const VERSION_FILE_RE = /^(v?)(\d+(?:\.\d+){0,2})$/

const updateVersionFile = (
  file: string,
  latest: string,
  isDry: boolean,
): { changed: boolean; detail: string } => {
  const raw = readFileSync(file, 'utf8')
  const current = raw.trim()
  const [, prefix = '', version] = VERSION_FILE_RE.exec(current) ?? []
  // aliases like lts/* or node already float
  if (!version)
    return { changed: false, detail: `${path.basename(file)} ${current} kept` }
  // keep the file's precision: v22 → v26, not v26.3.0
  const parts = version.split('.').length
  const next = prefix + latest.split('.').slice(0, parts).join('.')
  // the gated release can trail a hand-picked one: never downgrade
  const [from, to] = [coerce(version), coerce(next)]
  if (!from || !to || !gt(to, from))
    return { changed: false, detail: `${path.basename(file)} is latest` }
  if (!isDry)
    writeFileSync(file, next + (raw.endsWith('\n') ? '\n' : ''), 'utf8')
  return {
    changed: true,
    detail: `${path.basename(file)} ${current}  →  ${next}`,
  }
}

const stepNodeVersion = async (
  dir: string,
  isDry: boolean,
): Promise<UpdateResult> => {
  const base = { id: 'node-version', desc: 'node version files' }
  const files = ['.nvmrc', '.node-version']
    .map((f) => path.join(dir, f))
    .filter((f) => existsSync(f))
  if (files.length === 0)
    return { ...base, pass: true, changed: false, detail: 'no version file' }
  try {
    const response = await fetch('https://nodejs.org/dist/index.json')
    if (!response.ok)
      throw new Error(
        `GET nodejs.org/dist/index.json — HTTP ${response.status}`,
      )
    const index = (await response.json()) as {
      version: string
      date: string
      lts: string | false
    }[]
    // newest first
    const lts = index.find((v) => v.lts && isOldEnough(v.date))
    if (!lts)
      throw new Error(`no LTS release is ${MIN_RELEASE_AGE_DAYS} days old yet`)
    const latest = lts.version.replace(/^v/, '')
    const results = files.map((f) => updateVersionFile(f, latest, isDry))
    return {
      ...base,
      pass: true,
      changed: results.some((r) => r.changed),
      detail: results.map((r) => r.detail).join('\n'),
    }
  } catch (error) {
    return { ...base, pass: false, changed: false, detail: String(error) }
  }
}

const stepBunVersion = async (
  dir: string,
  isDry: boolean,
): Promise<UpdateResult> => {
  const base = { id: 'bun-version', desc: 'bun version file' }
  const file = path.join(dir, '.bun-version')
  if (!existsSync(file))
    return { ...base, pass: true, changed: false, detail: 'no version file' }
  try {
    const { version: latest } = await gatedRelease('bun')
    const result = updateVersionFile(file, latest, isDry)
    return { ...base, pass: true, ...result }
  } catch (error) {
    return { ...base, pass: false, changed: false, detail: String(error) }
  }
}

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt']
const COPYRIGHT_RE =
  /(copyright(?:\s+\(c\)|\s+©)?\s+)(\d{4})(?:\s*-\s*(\d{4}))?/i

const stepLicenseYear = (dir: string, isDry: boolean): UpdateResult => {
  const base = { id: 'license-year', desc: 'LICENSE copyright year' }
  const file = LICENSE_FILES.map((f) => path.join(dir, f)).find((f) =>
    existsSync(f),
  )
  if (!file)
    return { ...base, pass: true, changed: false, detail: 'no license file' }
  const raw = readFileSync(file, 'utf8')
  const match = COPYRIGHT_RE.exec(raw)
  if (!match?.[2])
    return {
      ...base,
      pass: true,
      changed: false,
      detail: 'no copyright year found',
    }
  const year = new Date().getFullYear()
  const start = match[2]
  const end = Number(match[3] ?? start)
  if (end >= year)
    return {
      ...base,
      pass: true,
      changed: false,
      detail: `${start}${match[3] ? '-' + match[3] : ''} is current`,
    }
  const current = match[0]
  const next = `${match[1] ?? ''}${start}-${year}`
  if (!isDry)
    writeFileSync(
      file,
      raw.replace(COPYRIGHT_RE, () => next),
      'utf8',
    )
  return {
    ...base,
    pass: true,
    changed: true,
    detail: `${current.trim()}  →  ${next.trim()}`,
  }
}

const ACTION_FILES = [
  '.github/workflows/*.{yml,yaml}',
  '.github/actions/**/*.{yml,yaml}',
  'action.{yml,yaml}',
  'actions/**/action.{yml,yaml}',
]

// `uses: <action>@<ref><rest>`, the action `owner/repo[/path]`: local and
// docker ones don't match ACTION_RE; the rest holds a `# comment`
const USES_RE =
  /^([ \t]*(?:-[ \t]+)?uses:[ \t]*["']?)([^\s"'@]+)@([^\s"'#]+)((?:[ \t"'#].*)?)$/gm
const ACTION_RE = /^[\w-][\w.-]*\/[\w.-]+/
const repoOf = (action: string): string | undefined =>
  ACTION_RE.exec(action)?.[0]
const COMMENT_RE = /^(["']?)(?:[ \t]+#[ \t]*(\S+))?/

const SHA_RE = /^[\da-f]{40}$/

// v7 < v7.0.1: on a tie, the more precise tag
const compareTags = (a: string, b: string): number =>
  compare(coerce(a) ?? '0.0.0', coerce(b) ?? '0.0.0') ||
  a.split('.').length - b.split('.').length

type GitHubRelease = {
  tag_name: string
  published_at: string | null
  draft: boolean
  prerelease: boolean
}

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  return {
    accept: 'application/vnd.github+json',
    ...(token && { authorization: `Bearer ${token}` }),
  }
}

// an action's tags and its newest version tag past the age gate, dated by its
// GitHub releases (own actions skip the gate); no `latest` says why in `note`
type ActionTags = { tags: Map<string, string>; latest?: string; note?: string }

const resolveAction = async (
  repo: string,
  cwd: string,
): Promise<ActionTags> => {
  const tags = await remoteTags(`https://github.com/${repo}`, cwd)
  if (!tags) throw new Error('tags unreachable')
  let versions = tags.keys().filter((t) => VERSION_FILE_RE.test(t))
  if (!repo.startsWith('lzear/')) {
    const releases = await fetchJson<GitHubRelease[]>(
      `https://api.github.com/repos/${repo}/releases?per_page=100`,
      githubHeaders(),
    )
    if (releases.length === 0) return { tags, note: 'no releases to date' }
    const old = new Set(
      releases
        .filter(
          (r) =>
            !r.draft &&
            !r.prerelease &&
            r.published_at !== null &&
            isOldEnough(r.published_at),
        )
        .map((r) => r.tag_name),
    )
    versions = versions.filter((t) => old.has(t))
  }
  const latest = versions.toArray().toSorted(compareTags).at(-1)
  return latest
    ? { tags, latest }
    : { tags, note: `no release is ${MIN_RELEASE_AGE_DAYS} days old yet` }
}

// the pin's next ref and comment, or null to keep it: a SHA follows the
// newest tag, a version tag keeps its precision (v4 → v5); branches stay
const bumpPin = (
  ref: string,
  comment: string | undefined,
  { tags, latest }: ActionTags,
): { from: string; to: string; ref: string; comment?: string } | null => {
  const sha = latest && tags.get(latest)
  if (!latest || !sha) return null
  if (SHA_RE.test(ref)) {
    const from =
      comment && VERSION_FILE_RE.test(comment)
        ? comment
        : [...tags]
            .filter(([t, s]) => s === ref && VERSION_FILE_RE.test(t))
            .map(([t]) => t)
            .toSorted(compareTags)
            .at(-1)
    return !from || compareTags(latest, from) <= 0
      ? null
      : { from, to: latest, ref: sha, comment: latest }
  }
  const [, prefix = '', version] = VERSION_FILE_RE.exec(ref) ?? []
  if (!version) return null
  const parts = latest.replace(/^v/, '').split('.')
  const next = prefix + parts.slice(0, version.split('.').length).join('.')
  const bumped = tags.has(next) ? next : latest
  return compare(coerce(bumped) ?? '0.0.0', coerce(ref) ?? '0.0.0') <= 0
    ? null
    : { from: ref, to: bumped, ref: bumped, ...(comment && { comment }) }
}

const stepActions = async (
  dir: string,
  isDry: boolean,
): Promise<UpdateResult> => {
  const base = { id: 'actions', desc: 'GitHub Actions pins' }
  const contents = new Map(
    globSync(ACTION_FILES, { cwd: dir })
      .toSorted((a, b) => a.localeCompare(b))
      .map((f) => [f, readFileSync(path.join(dir, f), 'utf8')]),
  )
  const repos = new Set(
    contents
      .values()
      .flatMap((c) => c.matchAll(USES_RE).map((m) => repoOf(m[2] ?? '')))
      .filter((r) => r !== undefined),
  )
  if (repos.size === 0)
    return { ...base, pass: true, changed: false, detail: 'no action pins' }
  const resolved = new Map<string, ActionTags | { error: string }>(
    await Promise.all(
      [...repos].map(async (repo) => {
        try {
          return [repo, await resolveAction(repo, dir)] as const
        } catch (error) {
          return [repo, { error: String(error) }] as const
        }
      }),
    ),
  )
  const lines = new Set<string>()
  for (const [repo, r] of resolved)
    if ('error' in r) lines.add(`${repo}: ${r.error}`)
    else if (r.note) lines.add(`${repo}: ${r.note}, kept`)
  const bumps = new Set<string>()
  for (const [file, content] of contents) {
    const next = content.replaceAll(
      USES_RE,
      (
        line: string,
        prefix: string,
        action: string,
        ref: string,
        rest: string,
      ) => {
        const repo = repoOf(action)
        const tags = repo && resolved.get(repo)
        const [match = '', quote = '', comment] = COMMENT_RE.exec(rest) ?? []
        const bump = tags && !('error' in tags) && bumpPin(ref, comment, tags)
        if (!bump) return line
        bumps.add(`${repo} ${bump.from}  →  ${bump.to}`)
        const note = bump.comment ? ` # ${bump.comment}` : ''
        return `${prefix}${action}@${bump.ref}${quote}${note}${rest.slice(match.length)}`
      },
    )
    if (next !== content && !isDry)
      writeFileSync(path.join(dir, file), next, 'utf8')
  }
  const isFailed = resolved.values().some((r) => 'error' in r)
  return {
    ...base,
    pass: !isFailed,
    changed: bumps.size > 0,
    detail: [...bumps, ...lines].join('\n') || 'up to date',
  }
}

export const installCommands = (
  pm: PackageManager,
): [string, ...string[]][] => {
  switch (pm.name) {
    case 'bun':
      return [
        ['bun', 'update', '--recursive'],
        ['bun', 'install'],
      ]
    case 'pnpm':
      return [
        ['pnpm', 'install'],
        ['pnpm', 'update', '--recursive'],
        ['pnpm', 'dedupe'],
      ]
    case 'yarn':
      return pm.version?.startsWith('1.')
        ? [
            ['yarn', 'install'],
            ['yarn', 'upgrade'],
          ]
        : [
            ['yarn', 'install'],
            // '*' alone skips scoped packages (@foo/bar) — needs '@*/*' too
            ['yarn', 'up', '--recursive', '*', '@*/*'],
            ['yarn', 'dedupe'],
          ]
    case 'npm':
      return [
        ['npm', 'install'],
        ['npm', 'update'],
        ['npm', 'dedupe'],
      ]
  }
}

const lockfileHash = (dir: string): string =>
  LOCKFILES.map(([f]) => path.join(dir, f))
    .filter((f) => existsSync(f))
    .map((f) => createHash('sha256').update(readFileSync(f)).digest('hex'))
    .join('|')

// bun update rewrites each range to the version it resolves (^21 → ^21.2.3):
// stepInstall puts the manifests back, and bun install keeps the lockfile's
const manifests = (dir: string): Map<string, string> =>
  new Map(
    [dir, ...getWorkspaceDirectories(dir)]
      .map((d) => path.join(d, 'package.json'))
      .filter((f) => existsSync(f))
      .map((f) => [f, readFileSync(f, 'utf8')]),
  )

const stepInstall = (dir: string, pm: PackageManager): UpdateResult => {
  const base = {
    id: 'install',
    desc: `install & refresh lockfile (${pm.name})`,
  }
  const before = lockfileHash(dir)
  const ranges = pm.name === 'bun' ? manifests(dir) : new Map<string, string>()
  const lines: string[] = []
  for (const [command, ...arguments_] of installCommands(pm)) {
    lines.push(`$ ${[command, ...arguments_].join(' ')}`)
    const result = spawnSync(command, arguments_, {
      cwd: dir,
      stdio: 'inherit',
    })
    for (const [file, raw] of ranges) writeFileSync(file, raw, 'utf8')
    if (result.status !== 0)
      return {
        ...base,
        pass: false,
        changed: lockfileHash(dir) !== before,
        detail: `${lines.join('\n')}\nexited with ${result.status ?? 'signal'}`,
      }
  }
  const changed = lockfileHash(dir) !== before
  return {
    ...base,
    pass: true,
    changed,
    detail: changed ? lines.join('\n') : 'lockfile unchanged',
  }
}

const STEP_IDS = new Set<string>(UPDATE_STEPS)

/**
Bumps dependency ranges, the `packageManager` field, Node and Bun version
files, GitHub Actions pins and the LICENSE year, then installs.

@param options `dry` writes nothing, `install: false` skips the install,
`only` and `skip` pick steps by id ({@linkcode UPDATE_STEPS})
@throws on an unknown id in `only` or `skip`
*/
export const runUpdate = async (
  options: UpdateOptions = {},
): Promise<UpdateReport> => {
  const {
    dir = process.cwd(),
    dry: isDry = false,
    install: isInstall = true,
    only,
    skip = [],
  } = options
  const unknown = [...(only ?? []), ...skip].filter((id) => !STEP_IDS.has(id))
  if (unknown.length > 0)
    throw new Error(
      `Unknown step: ${unknown.join(', ')} (valid: ${UPDATE_STEPS.join(', ')})`,
    )
  const isOn = (id: UpdateStepId): boolean =>
    (!only || only.includes(id)) && !skip.includes(id)
  const packageManager = detectPackageManager(dir)

  // stepDeps and stepPackageManager both write package.json: deps first, the
  // rest (network-bound, other files) at once
  const steps: [UpdateStepId, () => Promise<UpdateResult>][] = [
    ['package-manager', () => stepPackageManager(dir, isDry)],
    ['node-version', () => stepNodeVersion(dir, isDry)],
    ['bun-version', () => stepBunVersion(dir, isDry)],
    ['actions', () => stepActions(dir, isDry)],
    ['license-year', () => Promise.resolve(stepLicenseYear(dir, isDry))],
  ]
  const results = [
    ...(isOn('deps') ? [await stepDeps(dir, isDry)] : []),
    ...(await Promise.all(
      steps.filter(([id]) => isOn(id)).map(([, step]) => step()),
    )),
  ]
  if (isInstall && !isDry && isOn('install'))
    results.push(stepInstall(dir, packageManager))

  return { dir, packageManager, results }
}
