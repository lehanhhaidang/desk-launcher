import { defineConfig } from 'vitest/config'

// The theme engine lives in packages/theme (source-only, consumed via alias).
// Its pure resolve/* logic is unit-tested here, where vitest is installed.
export default defineConfig({
  test: {
    include: ['../../packages/theme/src/**/*.test.ts'],
    environment: 'node',
  },
})
