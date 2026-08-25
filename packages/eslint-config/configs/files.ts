export const JS = ['**/*.js', '**/*.cjs', '**/*.mjs']
export const TS = ['**/*.ts', '**/*.cts', '**/*.mts']
export const JSX = ['**/*.jsx']
export const TSX = ['**/*.tsx']
export const REACT = [...JSX, ...TSX]
export const CORE = [...JS, ...TS, ...JSX, ...TSX]
export const TEST_JS = [
  '**/test/*.js',
  '**/test/*.cjs',
  '**/test/*.mjs',
  '**/*.test.js',
  '**/*.test.cjs',
  '**/*.test.mjs',
]
export const TEST_TS = [
  '**/test/*.ts',
  '**/test/*.cts',
  '**/test/*.mts',
  '**/*.test.ts',
  '**/*.test.cts',
  '**/*.test.mts',
]
export const TEST_JSX = ['**/test/*.jsx', '**/*.test.jsx']
export const TEST_TSX = ['**/test/*.tsx', '**/*.test.tsx']
export const TESTS = [...TEST_JS, ...TEST_TS, ...TEST_JSX, ...TEST_TSX]
export const PACKAGE_JSON = ['**/package.json']
