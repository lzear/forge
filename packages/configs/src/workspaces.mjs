import { execSync } from 'node:child_process'

// every workspace but the root, as { name, location }
export const listWorkspaces = (root) =>
  execSync('yarn workspaces list --json', { cwd: root })
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter(({ location }) => location !== '.')
