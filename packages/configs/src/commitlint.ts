/**
Commitlint config: conventional commits with a 100-character header limit.

```ts
// commitlint.config.ts
export { default } from '@lzear/configs/commitlint'
```

@module
*/

import conventional from '@commitlint/config-conventional'
import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'
import createPreset from 'conventional-changelog-conventionalcommits'

/**
The config, ready to default-export from the consumer's config file.
*/
const config: UserConfig = {
  ...conventional,
  // Inlined: commitlint resolves a preset name from the consumer's config
  // file, which Bun's isolated linker leaves without this transitive dep.
  parserPreset: {
    name: 'conventional-changelog-conventionalcommits',
    // typed `{}` upstream
    parserOpts: (createPreset() as { parser: unknown }).parser,
  },
  rules: {
    ...conventional.rules,
    'header-max-length': [RuleConfigSeverity.Error, 'always', 100],
  },
}

export default config
