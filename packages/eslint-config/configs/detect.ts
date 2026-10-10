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

// The workspace manifests below `cwd`, as globs (npm, Yarn and Bun read `workspaces`)
export const workspaceManifests = (cwd = process.cwd()): string[] => {
  const { workspaces = [] } = readManifest(path.join(cwd, 'package.json')) ?? {}
  const globs = Array.isArray(workspaces)
    ? workspaces
    : (workspaces.packages ?? [])
  return globs.map((glob) => path.posix.join(glob, 'package.json'))
}

// Layers to enable, from the dependencies of `cwd`'s manifest and its
// workspaces': manifests, not `require.resolve`, as Bun's isolated linker
// hides a workspace's dependencies from the root
export const detect = (
  cwd = process.cwd(),
): { react: boolean; typescript: boolean; vitest: boolean } => {
  const manifests = [
    'package.json',
    ...globSync(workspaceManifests(cwd), {
      cwd,
      exclude: (file) => file.includes('node_modules'),
    }),
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
