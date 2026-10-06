export const JS: string[] = ['**/*.js', '**/*.cjs', '**/*.mjs']
export const TS: string[] = ['**/*.ts', '**/*.cts', '**/*.mts']
export const JSX: string[] = ['**/*.jsx']
export const TSX: string[] = ['**/*.tsx']
export const REACT: string[] = [...JSX, ...TSX]
export const CORE: string[] = [...JS, ...TS, ...JSX, ...TSX]
export const TEST_JS: string[] = [
  '**/test/*.js',
  '**/test/*.cjs',
  '**/test/*.mjs',
  '**/*.test.js',
  '**/*.test.cjs',
  '**/*.test.mjs',
]
export const TEST_TS: string[] = [
  '**/test/*.ts',
  '**/test/*.cts',
  '**/test/*.mts',
  '**/*.test.ts',
  '**/*.test.cts',
  '**/*.test.mts',
]
export const TEST_JSX: string[] = ['**/test/*.jsx', '**/*.test.jsx']
export const TEST_TSX: string[] = ['**/test/*.tsx', '**/*.test.tsx']
export const TESTS: string[] = [
  ...TEST_JS,
  ...TEST_TS,
  ...TEST_JSX,
  ...TEST_TSX,
]
export const PACKAGE_JSON: string[] = ['**/package.json']
export const CONFIGS: string[] = ['**/*.config.*']
