import path from 'node:path'
import {defineConfig} from 'vitest/config'

// Offline unit tests. The live AI smoke tests (*.ai.test.ts) run via vitest.ai.config.ts.
export default defineConfig({
  resolve: {
    // Same `@` alias as vite.config.ts, so frontend modules can be unit-tested.
    alias: {'@': path.resolve(import.meta.dirname, './src')},
  },
  test: {
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'server/**/*.ai.test.ts'],
    environment: 'node',
    setupFiles: ['server/test/unit-setup.ts'],
  },
})
