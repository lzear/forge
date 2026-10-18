import { execSync } from 'node:child_process'

/**
every workspace but the root, unless the root is the only one: a single-package
repo publishes it, a monorepo's root stays out
@param {string} root
@returns {{ name: string, location: string }[]}
*/
export const listWorkspaces = (root) => {
  /**
  @type {{ name: string, location: string }[]}
  */
  const all = execSync('yarn workspaces list --json', { cwd: root })
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  return all.length === 1 ? all : all.filter(({ location }) => location !== '.')
}
