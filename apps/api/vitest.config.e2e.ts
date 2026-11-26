import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// npm run test:e2e  (needs a local Postgres -- see test/e2e/README.md)
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
