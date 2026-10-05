---
'@lzear/eslint-config': patch
---

Type-only imports take `import type`: `verbatimModuleSyntax` kept `import { type A } from 'x'` as `import 'x'`.
