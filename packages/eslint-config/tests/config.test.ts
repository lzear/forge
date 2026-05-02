import config from '../index'

describe('@lzear/eslint-config', () => {
  it('matches the snapshot', async () => {
    let lzearConfig = await config()
    lzearConfig = lzearConfig.map((item) => {
      const parserOptions = item.languageOptions?.parserOptions as
        | Record<string, unknown>
        | undefined
      return parserOptions?.tsconfigRootDir
        ? {
            ...item,
            languageOptions: {
              ...item.languageOptions,
              parserOptions: {
                ...parserOptions,
                tsconfigRootDir: '/repo/eslint-config',
              },
            },
          }
        : item
    })
    await expect(lzearConfig).toMatchFileSnapshot('./snapshots/config.txt')
  })
})
