import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RuleTester } from 'eslint'
import { preferRelativeImports } from '../plugin/rules/prefer-relative-imports'

// a package whose tsconfig aliases resolve both inside and outside it; real
// path because resolvers return one (macOS tmpdir is a symlink)
const temporary = mkdtempSync(path.join(tmpdir(), 'prefer-relative-imports-'))
const root = realpathSync(temporary)
const pkg = path.join(root, 'pkg')
const files = {
  'pkg/package.json': '{}',
  'pkg/tsconfig.json': JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: { '@project-root/*': ['src/*'], '@outside/*': ['../outside/*'] },
    },
  }),
  'pkg/src/a/file.ts': '',
  'pkg/src/a/sibling.ts': '',
  'pkg/src/app.css': '',
  'pkg/src/a/index.ts': '',
  'pkg/src/a/dir/index.ts': '',
  'pkg/src/b/c.ts': '',
  'pkg/src/a/deep/file.ts': '',
  'outside/x.ts': '',
}
for (const [file, content] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), content)
}

// the Linter matches files against the cwd it is constructed in
const cwd = process.cwd()
process.chdir(root)
afterAll(() => {
  process.chdir(cwd)
})

const ruleTester = new RuleTester({
  settings: {
    'import/resolver': {
      typescript: { project: path.join(pkg, 'tsconfig.json') },
    },
  },
})

const from = (file: string) => ({
  filename: path.join(pkg, 'src', file),
})

const importOf = (source: string) => `import x from '${source}'`
// the fix writes the specifier with JSON.stringify
const fixed = (source: string) => `import x from "${source}"`

ruleTester.run('prefer-relative-imports', preferRelativeImports, {
  valid: [
    { code: importOf('./sibling'), ...from('a/file.ts') },
    { code: importOf('@project-root/nope'), ...from('a/file.ts') },
    { code: importOf('@outside/x'), ...from('a/file.ts') },
    { code: importOf('@project-root/b/c'), ...from('a/deep/file.ts') },
  ],
  invalid: [
    {
      code: importOf('@project-root/a/sibling'),
      output: fixed('./sibling'),
      ...from('a/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
    {
      code: importOf('@project-root/a/sibling.ts'),
      output: fixed('./sibling.ts'),
      ...from('a/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
    {
      code: importOf('@project-root/app.css?url'),
      output: fixed('../app.css?url'),
      ...from('a/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
    {
      code: importOf('@project-root/a/dir'),
      output: fixed('./dir'),
      ...from('a/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
    {
      code: importOf('@project-root/a'),
      output: fixed('.'),
      ...from('a/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
    {
      code: importOf('@project-root/b/c'),
      output: fixed('../../b/c'),
      options: [{ maxParentPrefixes: 2 }],
      ...from('a/deep/file.ts'),
      errors: [{ messageId: 'preferRelative' }],
    },
  ],
})
