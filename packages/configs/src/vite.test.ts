import type { Connect, UserConfig, ViteDevServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { defineReactConfig, forgePlugin } from './vite.ts'

// vitest itself may run under an agent: pin it per test
const environment = vi.hoisted(() => ({ isAgent: false }))
vi.mock('std-env', () => environment)

const config = (user: UserConfig) => {
  const hook = forgePlugin().config
  if (typeof hook !== 'function') throw new TypeError('no config hook')
  return hook.call({} as never, user, { command: 'serve', mode: 'development' })
}

const middleware = () => {
  let handle: Connect.NextHandleFunction | undefined
  const server = {
    middlewares: {
      use: (fn: Connect.NextHandleFunction) => {
        handle = fn
      },
    },
  } as unknown as ViteDevServer
  const hook = forgePlugin().configureServer
  if (typeof hook !== 'function') throw new TypeError('no configureServer hook')
  void hook.call({} as never, server)
  if (!handle) throw new Error('no middleware')
  return handle
}

const request = (url: string) => {
  const end = vi.fn()
  const writeHead = vi.fn(() => ({ end }))
  const next = vi.fn()
  middleware()({ url } as never, { writeHead } as never, next)
  return { end, next, writeHead }
}

describe('forgePlugin', () => {
  it('logs warnings only under an agent', () => {
    environment.isAgent = true
    expect(config({})).toEqual({ logLevel: 'warn' })
    environment.isAgent = false
    expect(config({})).toEqual({ logLevel: 'info' })
  })

  it('keeps a set logLevel', () => {
    environment.isAgent = true
    expect(config({ logLevel: 'silent' })).toEqual({ logLevel: 'silent' })
  })

  it('404s /.well-known/ probes', () => {
    const { end, next, writeHead } = request(
      '/.well-known/appspecific/com.chrome.devtools.json',
    )
    expect(writeHead).toHaveBeenCalledWith(404)
    expect(end).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('passes other requests on', () => {
    const { next, writeHead } = request('/blog')
    expect(next).toHaveBeenCalled()
    expect(writeHead).not.toHaveBeenCalled()
  })
})

describe('defineReactConfig', () => {
  it('adds the React plugin and forgePlugin', () => {
    const plugins = defineReactConfig().plugins?.flat()
    expect(plugins?.some((p) => p && 'name' in p && p.name === 'forge')).toBe(
      true,
    )
  })
})
