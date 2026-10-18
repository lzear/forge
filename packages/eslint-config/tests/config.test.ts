import config from '../index'

describe('@lzear/eslint-config', () => {
  it('matches the snapshot', async () => {
    const lzearConfig = await config({
      node: true,
      react: true,
      typescript: true,
      vitest: true,
    })
    // plugin objects (rules' meta and docs, bundled configs) made 96% of the
    // snapshot: names suffice
    const blocks = lzearConfig.map(({ plugins, ...block }) =>
      plugins ? { ...block, plugins: Object.keys(plugins) } : block,
    )
    await expect(blocks).toMatchFileSnapshot('./snapshots/config.txt')
  })
})
