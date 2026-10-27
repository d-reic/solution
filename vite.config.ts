import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works on any host or subpath.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
