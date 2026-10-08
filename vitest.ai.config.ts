import {defineConfig} from 'vitest/config'

// Live smoke tests against the real Claude API (costs money). See plans/ai-model-tests.md.
export default defineConfig({
  test: {
    include: ['server/**/*.ai.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    silent: false, // always show the cost table printed in afterAll
    setupFiles: ['server/test/ai-setup.ts'],
  },
})
