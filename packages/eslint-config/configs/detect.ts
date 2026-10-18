import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

const readManifest = (file: string): Manifest | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Manifest
  } catch {
    return undefined
  }
}

// pnpm-workspace.yaml's `packages:`, a flat list of (quoted) globs
const pnpmWorkspaces = (cwd: string): string[] => {
  let text: string
  try {
    text = readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')
  } catch {
    return []
  }
  const globs: string[] = []
  let isPackages = false
  for (const line of text.split('\n')) {
    if (/^\s*(?:#.*)?$/.test(line)) continue
    if (/^\S/.test(line)) isPackages = /^packages:\s*(?:#.*)?$/.test(line)
    else if (isPackages && line.trimStart().startsWith('-')) {
      const item = line.trim().slice(1).split('#', 1)[0]?.trim() ?? ''
      const glob = /^(["'])(.*)\1$/.exec(item)?.[2] ?? item
      if (glob) globs.push(glob)
    }
  }
  return globs
}

// The workspace manifests below `cwd`, as globs: `files` to match, `ignores`
// from `!` negations (npm, Yarn and Bun read `workspaces`, pnpm
// pnpm-workspace.yaml)
export const workspaceManifests = (
  cwd = process.cwd(),
): { files: string[]; ignores: string[] } => {
  const { workspaces } = readManifest(path.join(cwd, 'package.json')) ?? {}
  const globs = Array.isArray(workspaces)
    ? workspaces
    : (workspaces?.packages ?? pnpmWorkspaces(cwd))
  const toManifest = (glob: string): string =>
    path.posix.join(glob, 'package.json')
  return {
    files: globs
      .filter((glob) => !glob.startsWith('!'))
      .map((glob) => toManifest(glob)),
    ignores: globs
      .filter((glob) => glob.startsWith('!'))
      .map((glob) => toManifest(glob.slice(1))),
  }
}

// Layers to enable, from the dependencies of `cwd`'s manifest and its
// workspaces': manifests, not `require.resolve`, as Bun's isolated linker
// hides a workspace's dependencies from the root
export const detect = (
  cwd = process.cwd(),
): { react: boolean; typescript: boolean; vitest: boolean } => {
  const { files, ignores } = workspaceManifests(cwd)
  const options = {
    cwd,
    exclude: (file: string) => file.includes('node_modules'),
  }
  const ignored = new Set(globSync(ignores, options))
  const manifests = [
    'package.json',
    ...globSync(files, options).filter((file) => !ignored.has(file)),
  ]
  const dependencies = new Set<string>()
  let tsconfig = false
  for (const file of manifests) {
    const manifest = readManifest(path.join(cwd, file))
    if (!manifest) continue
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })
    for (const name of names) dependencies.add(name)
    tsconfig ||= existsSync(path.join(cwd, path.dirname(file), 'tsconfig.json'))
  }
  return {
    react: dependencies.has('react'),
    typescript: tsconfig || dependencies.has('typescript'),
    vitest: dependencies.has('vitest'),
  }
}
