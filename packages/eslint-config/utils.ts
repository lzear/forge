/* eslint-disable @typescript-eslint/no-unsafe-return,@typescript-eslint/no-explicit-any */

export const interopDefault = async <T>(
  m: T | Promise<T>,
): Promise<T extends { default: infer U } ? U : T> => {
  const resolved = await m
  // Unwrap namespace object → module.exports (for CJS loaded via ESM dynamic import)
  const mod = (resolved as { default?: unknown }).default ?? resolved
  // Unwrap again only when a CJS-transpiled-ESM module has an explicit default export
  // (some packages set __esModule:true without a .default — the object itself is the export)
  if ((mod as { __esModule?: boolean }).__esModule) {
    const inner = (mod as { default?: unknown }).default
    if (inner !== undefined) return inner as any
  }
  return mod as any
}
