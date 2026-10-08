import {defineConfig} from 'vitest/config'

// Offline unit tests. The live AI smoke tests (*.ai.test.ts) run via vitest.ai.config.ts.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'server/**/*.ai.test.ts'],
    environment: 'node',
    setupFiles: ['server/test/unit-setup.ts'],
  },
})
