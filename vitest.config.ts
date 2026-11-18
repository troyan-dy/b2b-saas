import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/systems/**/*.ts',
        'src/content/**/*.ts',
        'src/core/{args,lang,pause-clock,rng,settings}.ts',
        'src/ui/{build-reasons,format,*-view}.ts',
        'src/game/layout.ts',
      ],
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { perFile: true, lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
