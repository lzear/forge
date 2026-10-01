/**
 * Re-export of `@lzear/repo-lint`: repo compliance checks and dependency updates.
 *
 * ```ts
 * import { checkLocal } from '@lzear/forge/repo-lint'
 *
 * const report = await checkLocal()
 * ```
 *
 * @module
 */

export type {
  Check,
  CheckLocalOptions,
  CheckRepoOptions,
  CheckResult,
  LocalCheck,
  PackageManager,
  PackageManagerName,
  RemoteCheck,
  RepoReport,
  UpdateOptions,
  UpdateReport,
  UpdateResult,
} from '@lzear/repo-lint'
export {
  checkLocal,
  checkRepo,
  detectPackageManager,
  runUpdate,
} from '@lzear/repo-lint'
