import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['src/**/__scratch_*.test.{js,jsx}'],
  },
});
