import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getWorkspaceDirectories, readPackage } from './update.ts'

/**
What syncing one file did, or would do on a dry run.
*/
export type SyncStatus = 'unchanged' | 'created' | 'updated'

/**
Outcome of syncing one file.
*/
export type SyncResult = {
  file: string
  status: SyncStatus
}

/**
All sync results for one directory.
*/
export type SyncReport = {
  dir: string
  results: SyncResult[]
}

/**
Options for {@linkcode syncTemplates}.
*/
export type SyncOptions = {
  dir?: string
  dry?: boolean
}

// bundled template (`templates/`, dotless: package tools skip dotfiles) -> file
const TEMPLATES: Record<string, string> = {
  '.editorconfig': 'editorconfig',
  '.codacy.yml': 'codacy.yml',
  'lefthook.yml': 'lefthook.yml',
  // shared as-is: allows @main refs to forge, hash-pins everything else
  '.github/zizmor.yml': 'zizmor.yml',
}

// forge <= 4.10 fetches these from forge's main branch
const LEGACY_COPIES: Record<string, string> = {
  'template/.editorconfig': 'editorconfig',
  'template/.codacy.yml': 'codacy.yml',
  'template/lefthook.yml': 'lefthook.yml',
}

/**
The forge repo hosts the reusable workflow and the templates.
*/
export const isForgeRepo = (dir: string): boolean =>
  getWorkspaceDirectories(dir).some(
    (d) => readPackage(d)?.name === '@lzear/forge',
  )

// from JSR, the module (and its templates) sits behind an https URL
const readTemplate = async (name: string): Promise<string> => {
  // a string: Deno's global URL type is not node:url's
  const url = new URL(`../templates/${name}`, import.meta.url).href
  if (url.startsWith('file:')) return readFile(fileURLToPath(url), 'utf8')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const syncFile = async (
  dir: string,
  file: string,
  template: string,
  isDry: boolean,
): Promise<SyncResult> => {
  const content = await readTemplate(template)
  const destination = path.join(dir, file)
  const current = await readFile(destination, 'utf8').catch(() => null)
  if (current === content) return { file, status: 'unchanged' }
  if (!isDry) {
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, 'utf8')
  }
  return { file, status: current === null ? 'created' : 'updated' }
}

/**
Writes forge's shared files (`.editorconfig`, `.codacy.yml`, `lefthook.yml`,
`.github/zizmor.yml`) from the templates bundled with this version.

@param options `dir` defaults to the cwd, `dry` writes nothing
*/
export const syncTemplates = async (
  options: SyncOptions = {},
): Promise<SyncReport> => {
  const { dir = process.cwd(), dry: isDry = false } = options
  const files = {
    ...TEMPLATES,
    ...(isForgeRepo(dir) && LEGACY_COPIES),
  }
  const results = await Promise.all(
    Object.entries(files).map(([file, template]) =>
      syncFile(dir, file, template, isDry),
    ),
  )
  return { dir, results }
}
