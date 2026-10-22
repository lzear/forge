import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Linter } from 'eslint'
import { includeIgnoreFile } from 'eslint/config'

export const ignores: string[] = [
  '**/.eslint-config-inspector/**',
  '**/vite.config.*.timestamp-*',
  '**/.vitepress/cache/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/.history/**',
  '**/.netlify/**',
  '**/.vercel/**',
  '**/.output/**',
  '**/output/**',
  '**/.cache/**',
  '**/.temp/**',
  '**/build/**',
  '**/.nuxt/**',
  '**/.next/**',
  '**/dist/**',
  '**/temp/**',
  '**/.tmp/**',
  '**/tmp/**',
]

/*
 * What the `.gitignore` in `cwd` lists, none when there is no such file.
 */
export const gitignored = (cwd: string = process.cwd()): Linter.Config[] => {
  const file = path.resolve(cwd, '.gitignore')
  return existsSync(file) ? [includeIgnoreFile(file, 'lzear/gitignore')] : []
}
