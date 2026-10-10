import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publint } from 'publint'
import { maxSatisfying, satisfies } from 'semver'
import { isForgeRepo, syncTemplate, syncTemplates } from './templates.ts'
import {
  detectPackageManager,
  getWorkspaceDirectories,
  getWorkspacePatterns,
  MIN_RELEASE_AGE_DAYS,
  type PackageManager,
  type PackageManagerName,
  readJsonFile,
  readPackage,
  stepDeps,
  writeJsonFile,
} from './update.ts'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

/**
A check result carrying an explanation.
*/
export type CheckDetail = {
  pass: boolean
  detail?: string
}
type CheckResult = boolean | CheckDetail | Promise<boolean | CheckDetail>

/**
A check run against a checkout directory.
*/
export type LocalCheck = {
  id: string
  desc: string
  type: 'local'
  publishedOnly?: boolean
  check: (dir: string) => CheckResult
  /**
  repairs a failure, resolving to what it changed
  */
  fix?: (dir: string) => string | Promise<string>
}

/**
A check run against a GitHub repo through the `gh` CLI.
*/
export type RemoteCheck = {
  id: string
  desc: string
  type: 'remote'
  publishedOnly?: boolean
  check: (repo: string, dir: string) => CheckResult
}

/**
Any local or remote check.
*/
export type Check = LocalCheck | RemoteCheck

const findBin = (name: string, startDir: string): string | null => {
  let dir = startDir
  while (true) {
    const bin = path.join(dir, 'node_modules', '.bin', name)
    if (existsSync(bin)) return bin
    const parent = path.join(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}

type Spawned = {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

// spawnSync's result without blocking the event loop, so checks overlap
const run = (
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

const head = (output: string): string =>
  output.trim().split('\n').slice(0, 20).join('\n')

const eachPublishedPackage = async (
  dir: string,
  function_: (pkgDir: string) => CheckDetail | Promise<CheckDetail>,
): Promise<CheckDetail> => {
  const package_ = readPackage(dir)
  if (!package_) return { pass: true }
  if (package_.private === true) {
    const wsDirectories = getWorkspaceDirectories(dir)
    if (wsDirectories.length === 0) return { pass: true }
    const results = await Promise.all(
      wsDirectories.map((d) => eachPublishedPackage(d, function_)),
    )
    const failures = results.filter((r) => !r.pass)
    if (failures.length === 0) return { pass: true }
    const detail = failures.flatMap((r) => r.detail ?? []).join('\n')
    return { pass: false, ...(detail && { detail }) }
  }
  return function_(dir)
}

export const hasPublishedPkg = (dir: string): boolean => {
  const package_ = readPackage(dir)
  return package_
    ? package_.private !== true ||
        getWorkspaceDirectories(dir).some((d) => hasPublishedPkg(d))
    : false
}

const readmeIncludes = (dir: string, needle: string): boolean => {
  const f = path.join(dir, 'README.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes(needle)
}

const FORGE_WORKFLOW_RE = /uses:\s*lzear\/forge\/\.github\/workflows\/ci\.yml@/
const FORGE_PRESET = 'github>lzear/forge'
const FORGE_PRESET_RE = /^github>lzear\/forge(?:$|[#:])/

const callsForgeWorkflow = (dir: string): boolean => {
  const wfDir = path.join(dir, '.github', 'workflows')
  return (
    existsSync(wfDir) &&
    readdirSync(wfDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .some((f) =>
        FORGE_WORKFLOW_RE.test(readFileSync(path.join(wfDir, f), 'utf8')),
      )
  )
}

const FORGE_REMOTE = 'https://github.com/lzear/forge'
// `uses: lzear/forge/<path>@<ref> # <comment>`
const FORGE_PIN_RE = /lzear\/forge\/([^@\s]+)@([^\s#]+)(?:[ \t]*#[ \t]*(\S+))?/g

/**
A forge release: its `vX.Y.Z` tag and the commit it points to.
*/
export type ForgeRelease = { tag: string; sha: string }

// tag per commit, from `git ls-remote --tags`; an annotated tag's peeled
// `^{}` line gives its commit, overriding the tag object's SHA
const forgeTags = async (cwd: string): Promise<Map<string, string> | null> => {
  const r = await run('git', ['ls-remote', '--tags', FORGE_REMOTE], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (r.status !== 0) return null
  const tags = new Map<string, string>()
  for (const line of r.stdout.split('\n')) {
    const match = /^([\da-f]{40})\trefs\/tags\/(v[^^]+)(\^\{\})?$/.exec(line)
    if (!match) continue
    const [, sha = '', tag = '', peeled] = match
    if (peeled || !tags.has(tag)) tags.set(tag, sha)
  }
  return tags
}

const newestRelease = (tags: Map<string, string>): ForgeRelease | null => {
  // `*` skips prereleases
  const version = maxSatisfying(
    tags
      .keys()
      .map((t) => t.slice(1))
      .toArray(),
    '*',
  )
  const tag = version && `v${version}`
  const sha = tag && tags.get(tag)
  return tag && sha ? { tag, sha } : null
}

/**
The newest forge release, or `null` when its tags can't be read (offline).
*/
export const latestForgeRelease = async (
  cwd: string = process.cwd(),
): Promise<ForgeRelease | null> => {
  const tags = await forgeTags(cwd)
  return tags && newestRelease(tags)
}

/**
The forge release tagged `v<version>`, else the newest, or `null` offline.
*/
export const forgeRelease = async (
  version: string,
  cwd: string = process.cwd(),
): Promise<ForgeRelease | null> => {
  const tags = await forgeTags(cwd)
  if (!tags) return null
  const tag = `v${version}`
  const sha = tags.get(tag)
  return sha ? { tag, sha } : newestRelease(tags)
}

type ForgePin = { file: string; path: string; ref: string; comment?: string }

const forgePinFiles = (dir: string): string[] => {
  const workflows = path.join('.github', 'workflows')
  const actions = path.join('.github', 'actions')
  const list = (sub: string, recursive: boolean): string[] =>
    existsSync(path.join(dir, sub))
      ? readdirSync(path.join(dir, sub), { recursive, encoding: 'utf8' })
          .filter((f) => /\.ya?ml$/.test(f))
          .map((f) => path.join(sub, f))
      : []
  return [...list(workflows, false), ...list(actions, true)]
}

const findForgePins = (dir: string): ForgePin[] =>
  forgePinFiles(dir).flatMap((file) =>
    readFileSync(path.join(dir, file), 'utf8')
      .matchAll(FORGE_PIN_RE)
      .map(([, pinPath = '', ref = '', comment]) => ({
        file,
        path: pinPath,
        ref,
        ...(comment && { comment }),
      }))
      .toArray(),
  )

// rewrites every pin to `release`, resolving to the files it changed
const repin = (dir: string, release: ForgeRelease): string[] =>
  forgePinFiles(dir).filter((file) => {
    const f = path.join(dir, file)
    const content = readFileSync(f, 'utf8')
    const pinned = content.replaceAll(
      FORGE_PIN_RE,
      (_, pinPath: string) =>
        `lzear/forge/${pinPath}@${release.sha} # ${release.tag}`,
    )
    if (pinned === content) return false
    writeFileSync(f, pinned, 'utf8')
    return true
  })

// size-limit's config files; it also reads a `size-limit` package.json field
const SIZE_LIMIT_FILE_RE = /^\.size-limit(?:\.json|\.[cm]?[jt]s)?$/

const hasSizeLimit = (dir: string): boolean =>
  readPackage(dir)?.['size-limit'] !== undefined ||
  readdirSync(dir).some((f) => SIZE_LIMIT_FILE_RE.test(f))

const auditCommand = (pm: PackageManager): [string, ...string[]] => {
  switch (pm.name) {
    case 'npm':
      return ['npm', 'audit', '--omit', 'dev', '--audit-level', 'high']
    case 'pnpm':
      return ['pnpm', 'audit', '--prod', '--audit-level', 'high']
    case 'bun':
      return ['bun', 'audit']
    case 'yarn':
      return pm.version?.startsWith('1.')
        ? ['yarn', 'audit', '--level', 'high']
        : [
            'yarn',
            'npm',
            'audit',
            '--environment',
            'production',
            '--severity',
            'high',
          ]
  }
}

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

// Ranges that don't resolve against the npm registry
const NON_REGISTRY_RANGE_RE =
  /^(?:workspace:|file:|link:|portal:|catalog:|git|https?:)/

const collectEntry = (
  dependencies: Map<string, string>,
  name: string,
  range: unknown,
): void => {
  if (typeof range !== 'string' || NON_REGISTRY_RANGE_RE.test(range)) return
  // npm alias: "foo": "npm:real-pkg@^1"
  const alias = /^npm:(.+)@([^@]+)$/.exec(range)
  const target = alias?.[1] ?? name
  const targetRange = alias?.[2] ?? range
  if (!dependencies.has(target)) dependencies.set(target, targetRange)
}

const collectFromPackage = (
  dependencies: Map<string, string>,
  packageDir: string,
): void => {
  const package_ = readPackage(packageDir)
  for (const field of DEP_FIELDS) {
    const section = package_?.[field]
    if (typeof section !== 'object' || section === null) continue
    for (const [name, range] of Object.entries(section))
      collectEntry(dependencies, name, range)
  }
}

const collectDependencies = (dir: string): Map<string, string> => {
  const dependencies = new Map<string, string>()
  for (const packageDir of [dir, ...getWorkspaceDirectories(dir)])
    collectFromPackage(dependencies, packageDir)
  return dependencies
}

const findDeprecated = async (
  name: string,
  range: string,
): Promise<string | null> => {
  const response = await fetch(
    `https://registry.npmjs.org/${name.replace('/', '%2F')}`,
    {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as {
    versions: Record<string, { deprecated?: string }>
    'dist-tags'?: Record<string, string>
  }
  // Prefer the `latest` dist-tag when it satisfies the range — strict semver
  // maxSatisfying can pick a junk prerelease no package manager would install.
  const latest = data['dist-tags']?.latest
  const resolved =
    latest && satisfies(latest, range)
      ? latest
      : maxSatisfying(Object.keys(data.versions), range)
  if (!resolved) return null
  const deprecated = data.versions[resolved]?.deprecated
  return deprecated ? `${name}@${resolved} — ${deprecated.slice(0, 120)}` : null
}

// where each package manager sets its minimum release age, in units per day
const RELEASE_AGE: Record<
  PackageManagerName,
  [file: string, key: string, perDay: number]
> = {
  bun: ['bunfig.toml', 'minimumReleaseAge', 86_400],
  npm: ['.npmrc', 'min-release-age', 1],
  pnpm: ['pnpm-workspace.yaml', 'minimumReleaseAge', 1440],
  yarn: ['.yarnrc.yml', 'npmMinimalAgeGate', 1440],
}

// how each config writes its line; yarn's value is `3d`
const RELEASE_AGE_SEPARATOR: Record<PackageManagerName, string> = {
  bun: ' = ',
  npm: '=',
  pnpm: ': ',
  yarn: ': ',
}

/**
Where `pm` sets the minimum release age, and the line setting forge's gate.
*/
export const releaseAgeSetting = (
  pm: PackageManagerName,
): { file: string; key: string; line: string } => {
  const [file, key, perDay] = RELEASE_AGE[pm]
  const value =
    pm === 'yarn' ? `${MIN_RELEASE_AGE_DAYS}d` : MIN_RELEASE_AGE_DAYS * perDay
  return { file, key, line: `${key}${RELEASE_AGE_SEPARATOR[pm]}${value}` }
}

/**
`config` with `pm`'s gate line replacing the key's, else added (to
bunfig.toml's `[install]`).
*/
export const withReleaseAge = (
  config: string,
  pm: PackageManagerName,
): string => {
  const { key, line } = releaseAgeSetting(pm)
  const existing = new RegExp(String.raw`^${key}\s*[=:].*$`, 'm')
  if (existing.test(config)) return config.replace(existing, () => line)
  const install = /^\[install\][ \t]*$/m
  if (pm === 'bun' && install.test(config))
    return config.replace(install, (header) => `${header}\n${line}`)
  const block = pm === 'bun' ? `[install]\n${line}\n` : `${line}\n`
  if (config.trim() === '') return block
  return `${config.trimEnd()}\n${pm === 'bun' ? '\n' : ''}${block}`
}

// yarn's goes through `yarn config`: it defaults to 1 day and takes `3d`;
// `--json` keeps FORCE_COLOR (concurrently sets it) from coloring the number
const releaseAgeDays = async (
  dir: string,
  pm: PackageManagerName,
): Promise<number> => {
  const [file, key, perDay] = RELEASE_AGE[pm]
  if (pm === 'yarn') {
    const r = await run('yarn', ['config', 'get', key, '--json'], { cwd: dir })
    return (Number(r.stdout) || 0) / perDay
  }
  const f = path.join(dir, file)
  const config = existsSync(f) ? readFileSync(f, 'utf8') : ''
  const value = new RegExp(String.raw`^${key}\s*[=:]\s*(\d+)`, 'm').exec(
    config,
  )?.[1]
  return Number(value ?? 0) / perDay
}

// Bun runs lefthook's postinstall (trusted by default), which, unlike `prepare`,
// never fails a git-less Docker install. Yarn repos turn dependency scripts off,
// so `prepare` installs the hooks there.
const hookInstallGap = (dir: string): string | null => {
  const package_ = readPackage(dir)
  const scripts = package_?.scripts as Record<string, string> | undefined
  if (scripts?.prepare?.includes('lefthook install')) return null
  if (detectPackageManager(dir).name !== 'bun')
    return 'add "prepare": "lefthook install" to package.json scripts'
  // a trustedDependencies list replaces Bun's default one
  const trusted = package_?.trustedDependencies
  return Array.isArray(trusted) && !trusted.includes('lefthook')
    ? 'add lefthook to trustedDependencies'
    : null
}

const fixHookInstall = (dir: string): string | null => {
  if (!hookInstallGap(dir)) return null
  const file = path.join(dir, 'package.json')
  const json = readJsonFile(file)
  if (detectPackageManager(dir).name === 'bun') {
    json.data.trustedDependencies = [
      ...(json.data.trustedDependencies as string[]),
      'lefthook',
    ]
    writeJsonFile(file, json)
    return 'trustedDependencies: + lefthook'
  }
  const scripts = (json.data.scripts ?? {}) as Record<string, string>
  // keeps the rest of `prepare`, but not husky: two hook managers clash
  scripts.prepare = [
    ...(scripts.prepare ?? '')
      .split('&&')
      .map((step) => step.trim())
      .filter((step) => step && !/^husky\b/.test(step)),
    'lefthook install',
  ].join(' && ')
  json.data.scripts = scripts
  writeJsonFile(file, json)
  return `prepare: ${scripts.prepare}`
}

/**
Checks run against a checkout directory.
*/
export const LOCAL_CHECKS: LocalCheck[] = [
  {
    id: 'gitignore-env',
    desc: '.env ignored',
    type: 'local',
    check: async (dir) => {
      const r = await run('git', ['check-ignore', '-q', '.env'], { cwd: dir })
      return r.status === 0 || { pass: false, detail: 'add .env to .gitignore' }
    },
  },
  {
    id: 'readme-exists',
    desc: 'README',
    type: 'local',
    check: (dir) => existsSync(path.join(dir, 'README.md')),
  },
  {
    id: 'readme-npm-badge',
    desc: 'npm badge',
    type: 'local',
    publishedOnly: true,
    check: (dir) => readmeIncludes(dir, 'shields.io/npm/v/'),
  },
  {
    id: 'codacy',
    desc: 'Codacy',
    type: 'local',
    publishedOnly: true,
    check: (dir) => {
      const missing = [
        readmeIncludes(dir, 'project/badge/Grade/')
          ? null
          : 'grade badge missing in README',
        readmeIncludes(dir, 'project/badge/Coverage/')
          ? null
          : 'coverage badge missing in README',
        existsSync(path.join(dir, '.codacy.yml'))
          ? null
          : '.codacy.yml missing',
      ].filter((m): m is string => m !== null)
      return missing.length === 0 || { pass: false, detail: missing.join('\n') }
    },
  },
  {
    id: 'license',
    desc: 'LICENSE',
    type: 'local',
    publishedOnly: true,
    check: (dir) => existsSync(path.join(dir, 'LICENSE')),
  },
  {
    id: 'jsr-config',
    desc: 'deno.json in sync',
    type: 'local',
    publishedOnly: true,
    check: (dir) =>
      eachPublishedPackage(dir, (pkgDir) => {
        const denoPath = path.join(pkgDir, 'deno.json')
        if (!existsSync(denoPath)) return { pass: true }
        const package_ = readPackage(pkgDir)
        let deno: { name?: string; version?: string }
        try {
          deno = JSON.parse(readFileSync(denoPath, 'utf8')) as typeof deno
        } catch {
          return { pass: false, detail: 'deno.json is not valid JSON' }
        }
        const mismatches = [
          deno.name === package_?.name
            ? null
            : `name ${deno.name} does not match package.json`,
          deno.version === package_?.version
            ? null
            : `version ${deno.version} != ${package_?.version as string}`,
        ].filter((m): m is string => m !== null)
        return mismatches.length === 0
          ? { pass: true }
          : { pass: false, detail: mismatches.join('\n') }
      }),
  },
  {
    id: 'ci-workflow',
    desc: 'CI calls forge workflow',
    type: 'local',
    check: (dir) => {
      if (callsForgeWorkflow(dir) || isForgeRepo(dir)) return true
      return {
        pass: false,
        detail:
          'no workflow calls the forge reusable CI — replace the local ci.yml copy with:\n' +
          '  jobs:\n' +
          '    ci:\n' +
          '      uses: lzear/forge/.github/workflows/ci.yml@<sha> # vX.Y.Z\n' +
          '(pin to a commit SHA; renovate keeps it fresh)',
      }
    },
  },
  {
    id: 'forge-pins',
    desc: 'forge pins latest',
    type: 'local',
    check: async (dir) => {
      if (isForgeRepo(dir)) return { pass: true, detail: 'forge itself' }
      const pins = findForgePins(dir)
      if (pins.length === 0) return true
      const tags = await forgeTags(dir)
      const latest = tags && newestRelease(tags)
      if (!tags || !latest)
        return { pass: true, detail: 'not checked: forge tags unreachable' }
      const tagOf = new Map([...tags].map(([tag, sha]) => [sha, tag]))
      const stale = pins
        .filter((p) => p.ref !== latest.sha || p.comment !== latest.tag)
        .map((p) => {
          const current = tagOf.get(p.ref) ?? p.comment ?? p.ref.slice(0, 7)
          const shown =
            tagOf.has(p.ref) && p.comment !== current
              ? `${current} (# ${p.comment ?? 'none'})`
              : current
          return `${p.file}: ${p.path} ${shown} → ${latest.tag}`
        })
      return (
        stale.length === 0 || {
          pass: false,
          detail: [...stale, `Pin to: @${latest.sha} # ${latest.tag}`].join(
            '\n',
          ),
        }
      )
    },
    fix: async (dir) => {
      const latest = await latestForgeRelease(dir)
      if (!latest) throw new Error('forge tags unreachable')
      return repin(dir, latest)
        .map((file) => `${file} → ${latest.tag}`)
        .join('\n')
    },
  },
  {
    id: 'renovate',
    desc: 'renovate extends forge',
    type: 'local',
    check: (dir) => {
      const file = path.join(dir, 'renovate.json')
      if (!existsSync(file)) return false
      let config: { extends?: string[] }
      try {
        config = JSON.parse(readFileSync(file, 'utf8')) as typeof config
      } catch {
        return { pass: false, detail: 'renovate.json is not valid JSON' }
      }
      return (
        config.extends?.some((p) => FORGE_PRESET_RE.test(p)) === true || {
          pass: false,
          detail: 'add "github>lzear/forge" to renovate.json extends',
        }
      )
    },
    fix: (dir) => {
      const file = path.join(dir, 'renovate.json')
      if (!existsSync(file)) {
        const config = {
          $schema: 'https://docs.renovatebot.com/renovate-schema.json',
          extends: [FORGE_PRESET],
        }
        writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
        return 'created renovate.json'
      }
      const json = readJsonFile(file)
      const presets = json.data.extends
      json.data.extends = [
        ...((Array.isArray(presets) ? presets : []) as unknown[]),
        FORGE_PRESET,
      ]
      writeJsonFile(file, json)
      return `renovate.json extends: + ${FORGE_PRESET}`
    },
  },
  {
    id: 'git-hooks',
    desc: 'git hooks',
    type: 'local',
    // a missing commitlint config fails loudly at commit, unlike missing hooks
    check: (dir) => {
      const missing = [
        existsSync(path.join(dir, 'lefthook.yml'))
          ? null
          : 'lefthook.yml missing — run: forge sync',
        hookInstallGap(dir),
      ].filter((m): m is string => m !== null)
      return missing.length === 0 || { pass: false, detail: missing.join('\n') }
    },
    fix: async (dir) => {
      const isMissing = !existsSync(path.join(dir, 'lefthook.yml'))
      if (isMissing) await syncTemplate(dir, 'lefthook.yml')
      return [isMissing ? 'created lefthook.yml' : null, fixHookInstall(dir)]
        .filter((m): m is string => m !== null)
        .join('\n')
    },
  },
  {
    id: 'template-sync',
    desc: 'templates in sync',
    type: 'local',
    check: async (dir) => {
      const { results } = await syncTemplates({ dir, dry: true })
      const drifted = results.filter((r) => r.status !== 'unchanged')
      if (drifted.length === 0) return true
      const files = drifted.map(
        (r) => `${r.file} ${r.status === 'created' ? 'missing' : 'differs'}`,
      )
      return { pass: false, detail: [...files, 'Run: forge sync'].join('\n') }
    },
    fix: async (dir) => {
      const { results } = await syncTemplates({ dir })
      return results
        .filter((r) => r.status !== 'unchanged')
        .map((r) => `${r.file} ${r.status}`)
        .join('\n')
    },
  },
  {
    id: 'pkg-publint',
    desc: 'publint',
    type: 'local',
    publishedOnly: true,
    check: (dir) =>
      eachPublishedPackage(dir, async (pkgDir) => {
        const { messages } = await publint({ pkgDir })
        const failures = messages.filter(
          (m) => m.type === 'error' || m.type === 'warning',
        )
        if (failures.length === 0) return { pass: true }
        return {
          pass: false,
          detail: failures.map((m) => `[${m.type}] ${m.code}`).join('\n'),
        }
      }),
  },
  {
    id: 'pkg-attw',
    desc: 'attw',
    type: 'local',
    check: (dir) => {
      const bin = findBin('attw', _dirname)
      if (!bin) return { pass: false, detail: 'attw not available' }
      return eachPublishedPackage(dir, async (pkgDir) => {
        const r = await run(
          process.execPath,
          [bin, '--pack', '--profile', 'esm-only'],
          { cwd: pkgDir },
        )
        return r.status === 0
          ? { pass: true }
          : { pass: false, detail: (r.stdout + r.stderr).trim() }
      })
    },
  },
  {
    id: 'pkg-size-limit',
    desc: 'size-limit',
    type: 'local',
    // the repo's own bin: size-limit loads only plugins its package.json lists
    check: async (dir) => {
      const outputs = await Promise.all(
        [dir, ...getWorkspaceDirectories(dir)]
          .filter((d) => hasSizeLimit(d))
          .map(async (d) => {
            const bin = findBin('size-limit', d)
            if (!bin) return `${d}: size-limit not installed`
            const r = await run(process.execPath, [bin], {
              cwd: d,
              env: { ...process.env, NO_COLOR: '1' },
            })
            return r.status === 0 ? [] : head(r.stdout + r.stderr)
          }),
      )
      const failures = outputs.flat()
      return (
        failures.length === 0 || { pass: false, detail: failures.join('\n') }
      )
    },
  },
  {
    id: 'pkg-fallow',
    desc: 'fallow',
    type: 'local',
    check: async (dir) => {
      const bin = findBin('fallow', _dirname)
      if (!bin) return { pass: false, detail: 'fallow not available' }
      const r = await run(
        process.execPath,
        [bin, 'dead-code', '--format', 'compact'],
        { cwd: dir, env: { ...process.env, NO_COLOR: '1' } },
      )
      if (r.status === 0) return { pass: true }
      const detail = (r.stdout + r.stderr).trim()
      return { pass: false, detail: `${detail}\n\nRun: npx fallow dead-code` }
    },
  },
  {
    id: 'monorepo-lint',
    desc: 'sherif (workspaces)',
    type: 'local',
    check: async (dir) => {
      const package_ = readPackage(dir)
      if (!package_ || getWorkspacePatterns(package_).length === 0)
        return { pass: true, detail: 'not a monorepo' }
      const bin = findBin('sherif', _dirname)
      if (!bin) return { pass: false, detail: 'sherif not available' }
      const r = await run(process.execPath, [bin], {
        cwd: dir,
        env: { ...process.env, NO_COLOR: '1' },
      })
      if (r.status === 0) return true
      const detail = head(r.stdout + r.stderr)
      return { pass: false, detail }
    },
  },
  {
    id: 'deps-audit',
    desc: 'audit',
    type: 'local',
    check: async (dir) => {
      const pm = detectPackageManager(dir)
      const [command, ...arguments_] = auditCommand(pm)
      const r = await run(command, arguments_, { cwd: dir })
      if (r.error) return { pass: false, detail: String(r.error) }
      if (r.status === 0) return true
      const detail = head(r.stdout + r.stderr)
      return { pass: false, detail: detail || `audit exited ${r.status}` }
    },
  },
  {
    id: 'deps-deprecated',
    desc: 'no deprecated deps',
    type: 'local',
    check: async (dir) => {
      const dependencies = collectDependencies(dir)
      const failures: string[] = []
      await Promise.all(
        [...dependencies].map(async ([name, range]) => {
          try {
            const deprecated = await findDeprecated(name, range)
            if (deprecated) failures.push(deprecated)
          } catch (error) {
            failures.push(`${name} — check failed: ${String(error)}`)
          }
        }),
      )
      if (failures.length === 0) return true
      return {
        pass: false,
        detail: failures.toSorted((a, b) => a.localeCompare(b)).join('\n'),
      }
    },
  },
  {
    id: 'deps-fresh',
    desc: 'deps up to date',
    type: 'local',
    // the dry run of `forge update`, so .ncurc rejects apply to both
    check: async (dir) => {
      const { pass, changed, detail = '' } = await stepDeps(dir, true)
      return pass
        ? !changed || { pass: false, detail: `${detail}\n\nRun: forge update` }
        : { pass, detail }
    },
  },
  {
    id: 'deps-release-age',
    desc: 'minimum release age',
    type: 'local',
    check: async (dir) => {
      const { name, version } = detectPackageManager(dir)
      if (name === 'yarn' && version?.startsWith('1.'))
        return { pass: false, detail: 'Yarn 1 has none; move to Yarn 4' }
      const days = await releaseAgeDays(dir, name)
      if (days >= MIN_RELEASE_AGE_DAYS) return true
      const [file, key, perDay] = RELEASE_AGE[name]
      const value = MIN_RELEASE_AGE_DAYS * perDay
      return {
        pass: false,
        detail: `${days} days — set ${key} to ${value} in ${file}`,
      }
    },
    fix: async (dir) => {
      const { name, version } = detectPackageManager(dir)
      if (name === 'yarn' && version?.startsWith('1.'))
        throw new Error('Yarn 1 has none; move to Yarn 4')
      const [file, key] = RELEASE_AGE[name]
      if (name === 'yarn') {
        const gate = `${MIN_RELEASE_AGE_DAYS}d`
        const r = await run('yarn', ['config', 'set', key, gate], { cwd: dir })
        if (r.status !== 0)
          throw new Error(head(r.stdout + r.stderr) || String(r.error))
        return `${key}: ${gate} in ${file}`
      }
      const f = path.join(dir, file)
      const config = existsSync(f) ? readFileSync(f, 'utf8') : ''
      writeFileSync(f, withReleaseAge(config, name), 'utf8')
      return `${releaseAgeSetting(name).line} in ${file}`
    },
  },
]

/**
Why `gh` can't run the remote checks, or `null` when it can.
*/
export const ghProblem = async (
  cwd: string = process.cwd(),
): Promise<string | null> => {
  const r = await run('gh', ['auth', 'status', '--hostname', 'github.com'], {
    cwd,
  })
  if (r.error) return 'gh not installed: https://cli.github.com'
  return r.status === 0 ? null : 'gh not authenticated: gh auth login'
}

// `gh api`'s JSON, throwing its error
const ghApi = async <T>(endpoint: string, cwd: string): Promise<T> => {
  const r = await run('gh', ['api', endpoint], { cwd })
  if (r.status !== 0)
    throw new Error(
      head(r.stderr) || String(r.error ?? `gh exited ${r.status}`),
    )
  return JSON.parse(r.stdout) as T
}

/**
Lists the repo's GitHub Actions secret names, or `null` when `gh` fails.
*/
export const listSecrets = async (
  repo: string,
  cwd: string = process.cwd(),
): Promise<string[] | null> => {
  const r = await run(
    'gh',
    ['secret', 'list', '--repo', repo, '--json', 'name'],
    { cwd },
  )
  if (r.status !== 0) return null
  try {
    return (JSON.parse(r.stdout) as { name: string }[]).map((s) => s.name)
  } catch {
    return null
  }
}

type GhRepo = {
  visibility: string
  // admins only
  security_and_analysis?: Record<string, { status: string } | undefined>
}

type GhIssue = {
  title: string
  state: string
  created_at: string
  pull_request?: unknown
}

const RENOVATE_WINDOW_DAYS = 60

/**
Checks run against the GitHub repo.
*/
export const REMOTE_CHECKS: RemoteCheck[] = [
  {
    id: 'secret-codacy-token',
    desc: 'Codacy secret',
    type: 'remote',
    publishedOnly: true,
    check: async (repo, dir) => {
      const secrets = await listSecrets(repo, dir)
      if (!secrets) return { pass: false, detail: 'gh secret list failed' }
      return (
        secrets.includes('CODACY_PROJECT_TOKEN') || {
          pass: false,
          detail: 'CODACY_PROJECT_TOKEN missing — run: forge setup',
        }
      )
    },
  },
  {
    id: 'workflow-token-read',
    desc: 'GITHUB_TOKEN read-only',
    type: 'remote',
    check: async (repo, dir) => {
      const { default_workflow_permissions: permissions } = await ghApi<{
        default_workflow_permissions: string
      }>(`repos/${repo}/actions/permissions/workflow`, dir)
      return (
        permissions === 'read' || {
          pass: false,
          detail: `default ${permissions} — set read at https://github.com/${repo}/settings/actions`,
        }
      )
    },
  },
  {
    id: 'secret-scanning',
    desc: 'secret scanning',
    type: 'remote',
    check: async (repo, dir) => {
      const { visibility, security_and_analysis: security } =
        await ghApi<GhRepo>(`repos/${repo}`, dir)
      if (visibility !== 'public')
        return { pass: true, detail: `${visibility} repo: not checked` }
      const off = ['secret_scanning', 'secret_scanning_push_protection'].filter(
        (feature) => security?.[feature]?.status !== 'enabled',
      )
      return (
        off.length === 0 || {
          pass: false,
          detail: `${off.join(', ')} off — enable at https://github.com/${repo}/settings/security_analysis`,
        }
      )
    },
  },
  {
    id: 'renovate-active',
    desc: 'Renovate active',
    type: 'remote',
    // the issues endpoint lists PRs too
    check: async (repo, dir) => {
      if (!existsSync(path.join(dir, 'renovate.json')))
        return { pass: true, detail: 'no renovate.json' }
      const query = new URLSearchParams({
        creator: 'renovate[bot]',
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: '100',
      })
      const issues = await ghApi<GhIssue[]>(
        `repos/${repo}/issues?${query}`,
        dir,
      )
      const since = Date.now() - RENOVATE_WINDOW_DAYS * 86_400_000
      const isActive = issues.some((i) =>
        i.pull_request === undefined
          ? i.state === 'open' && i.title === 'Dependency Dashboard'
          : Date.parse(i.created_at) > since,
      )
      return (
        isActive || {
          pass: false,
          detail: `no open Dependency Dashboard, no renovate[bot] PR in ${RENOVATE_WINDOW_DAYS} days — install https://github.com/apps/renovate`,
        }
      )
    },
  },
]

/**
Every check, local then remote.
*/
export const CHECKS: Check[] = [...LOCAL_CHECKS, ...REMOTE_CHECKS]
