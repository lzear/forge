import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { run as ncuRun } from 'npm-check-updates'

export type PackageManagerName = 'npm' | 'yarn' | 'pnpm' | 'bun'

export interface PackageManager {
  name: PackageManagerName
  version?: string
  source: 'packageManager' | 'lockfile' | 'default'
}

export interface UpdateResult {
  id: string
  desc: string
  pass: boolean
  changed: boolean
  detail?: string
}

export interface UpdateReport {
  dir: string
  packageManager: PackageManager
  results: UpdateResult[]
}

export interface UpdateOptions {
  dir?: string
  dry?: boolean
  install?: boolean
}

const LOCKFILES: [string, PackageManagerName][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const PM_FIELD_RE = /^(npm|yarn|pnpm|bun)@([^+\s]+)/

interface JsonFile {
  data: Record<string, unknown>
  indent: string
  trailingNewline: boolean
}

const readJsonFile = (file: string): JsonFile => {
  const raw = readFileSync(file, 'utf8')
  return {
    data: JSON.parse(raw) as Record<string, unknown>,
    indent: /^[ \t]+/m.exec(raw)?.[0] ?? '  ',
    trailingNewline: raw.endsWith('\n'),
  }
}

const writeJsonFile = (file: string, json: JsonFile): void => {
  writeFileSync(
    file,
    JSON.stringify(json.data, null, json.indent) +
      (json.trailingNewline ? '\n' : ''),
    'utf8',
  )
}

export const detectPackageManager = (dir: string): PackageManager => {
  const packageFile = path.join(dir, 'package.json')
  if (existsSync(packageFile))
    try {
      const package_ = JSON.parse(readFileSync(packageFile, 'utf8')) as Record<
        string,
        unknown
      >
      if (typeof package_.packageManager === 'string') {
        const match = PM_FIELD_RE.exec(package_.packageManager)
        if (match?.[1] && match[2])
          return {
            name: match[1] as PackageManagerName,
            version: match[2],
            source: 'packageManager',
          }
      }
    } catch {
      /* fall through to lockfile detection */
    }

  for (const [file, name] of LOCKFILES)
    if (existsSync(path.join(dir, file))) return { name, source: 'lockfile' }
  return { name: 'npm', source: 'default' }
}

const fetchJson = async (url: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GET ${url} — HTTP ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

// yarn ≥2 is not published as `yarn` on npm (that package is stuck on 1.x);
// corepack resolves it from `@yarnpkg/cli-dist`.
const pmRegistryName = (
  name: PackageManagerName,
  currentMajor: number,
): string =>
  name === 'yarn' && currentMajor >= 2 ? '@yarnpkg%2Fcli-dist' : name

const latestPackageVersion = async (name: string): Promise<string> => {
  const data = await fetchJson(`https://registry.npmjs.org/${name}/latest`)
  if (typeof data.version !== 'string')
    throw new Error(`no version in registry response for ${name}`)
  return data.version
}

const hasWorkspaces = (dir: string): boolean => {
  try {
    const package_ = JSON.parse(
      readFileSync(path.join(dir, 'package.json'), 'utf8'),
    ) as Record<string, unknown>
    const ws = package_.workspaces
    if (Array.isArray(ws)) return ws.length > 0
    const packages = (ws as Record<string, unknown> | undefined)?.packages
    return Array.isArray(packages) && packages.length > 0
  } catch {
    return false
  }
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

const stepDeps = async (dir: string, isDry: boolean): Promise<UpdateResult> => {
  const base = { id: 'deps', desc: 'dependency ranges (ncu)' }
  try {
    const isWorkspaces = hasWorkspaces(dir)
    const rc = await loadNcuRc(dir)
    const result = (await ncuRun({
      ...rc.config,
      packageFile: path.join(dir, 'package.json'),
      cwd: dir,
      upgrade: !isDry,
      silent: true,
      dep: ['prod', 'dev', 'optional', 'peer'],
      ...(isWorkspaces && { workspaces: true, root: true }),
    })) as Record<string, string> | Record<string, Record<string, string>>

    const entries = isWorkspaces
      ? Object.values(result as Record<string, Record<string, string>>).flatMap(
          (x) => Object.entries(x),
        )
      : Object.entries(result as Record<string, string>)

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
    const [, name, current] = match as unknown as [
      string,
      PackageManagerName,
      string,
    ]
    const major = Number(current.split('.', 1)[0])
    const latest = await latestPackageVersion(pmRegistryName(name, major))
    if (latest === current)
      return {
        ...base,
        pass: true,
        changed: false,
        detail: `${name}@${current} is latest`,
      }
    json.data.packageManager = `${name}@${latest}`
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

const updateVersionFile = (
  file: string,
  latest: string,
  isDry: boolean,
): { changed: boolean; detail: string } => {
  const raw = readFileSync(file, 'utf8')
  const current = raw.trim()
  const isVPrefixed = current.startsWith('v')
  const next = isVPrefixed ? `v${latest}` : latest
  if (current === next)
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
      lts: string | false
    }[]
    const lts = index.find((v) => v.lts)
    if (!lts) throw new Error('no LTS release found')
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
    const latest = await latestPackageVersion('bun')
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

export const installCommands = (
  pm: PackageManager,
): [string, ...string[]][] => {
  switch (pm.name) {
    case 'bun':
      return [['bun', 'update']]
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
            ['yarn', 'up', '--recursive', '*'],
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

const stepInstall = (dir: string, pm: PackageManager): UpdateResult => {
  const base = {
    id: 'install',
    desc: `install & refresh lockfile (${pm.name})`,
  }
  const before = lockfileHash(dir)
  const lines: string[] = []
  for (const [command, ...arguments_] of installCommands(pm)) {
    lines.push(`$ ${[command, ...arguments_].join(' ')}`)
    const result = spawnSync(command, arguments_, {
      cwd: dir,
      stdio: 'inherit',
    })
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

export const runUpdate = async (
  options: UpdateOptions = {},
): Promise<UpdateReport> => {
  const {
    dir = process.cwd(),
    dry: isDry = false,
    install: isInstall = true,
  } = options
  const packageManager = detectPackageManager(dir)

  const results = [
    await stepDeps(dir, isDry),
    await stepPackageManager(dir, isDry),
    await stepNodeVersion(dir, isDry),
    await stepBunVersion(dir, isDry),
    stepLicenseYear(dir, isDry),
  ]
  if (isInstall && !isDry) results.push(stepInstall(dir, packageManager))

  return { dir, packageManager, results }
}
