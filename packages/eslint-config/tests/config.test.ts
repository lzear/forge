import config from '../index'

describe('@lzear/eslint-config', () => {
  it('matches the snapshot', async () => {
    const lzearConfig = await config({
      node: true,
      react: true,
      typescript: true,
      vitest: true,
    })
    await expect(lzearConfig).toMatchFileSnapshot('./snapshots/config.txt')
  })
})
