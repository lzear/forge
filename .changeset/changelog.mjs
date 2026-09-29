import base from '@changesets/cli/changelog'

// one line for the whole fixed group, not one per changeset commit
export default {
  ...base,
  getDependencyReleaseLine: (_changesets, dependencies) => {
    if (dependencies.length === 0) return ''
    const list = dependencies.map((d) => `${d.name}@${d.newVersion}`)
    return `- Updated dependencies: ${list.join(', ')}`
  },
}
