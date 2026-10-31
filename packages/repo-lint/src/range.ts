// The widest range that stays below the next breaking release: `^5`, `^0.23`,
// or `^0.0.4`, as below 1.0 each minor, and below 0.1 each patch, may break
export const caretRange = (version: string): string | undefined => {
  const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version) ?? []
  if (major === undefined || minor === undefined || patch === undefined)
    return undefined
  if (major !== '0') return `^${major}`
  return minor === '0' ? `^0.0.${patch}` : `^0.${minor}`
}
