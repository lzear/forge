import type { Linter } from 'eslint'
import lzearConfig from '@lzear/forge/eslint'

const base = await lzearConfig({ local: 'lzear' })

const config: Linter.Config[] = [...base]

export default config
