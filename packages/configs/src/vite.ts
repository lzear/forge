import react from '@vitejs/plugin-react'
import { type UserConfig } from 'vite'

export const defineReactConfig = (overrides: UserConfig = {}): UserConfig => ({
  plugins: [react()],
  ...overrides,
})
