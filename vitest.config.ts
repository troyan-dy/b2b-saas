import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // New runtime modules enter the gate automatically, even before a test imports them.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/{debug,gyms}/**', // developer tools, playtest bot and demo scenes
        'src/main.ts', // browser bootstrap and page lifecycle
        'src/core/{metrics,music,sound}.ts', // capture instrumentation and audio device adapters
        'src/game/{GameScene,flow,sale}.ts', // scene, menu and animation orchestration
        'src/view/{HelloScene,board,iso,lines,squares}.ts', // Phaser drawing and animation
        'src/ui/{client-city,hud,map-pan,paper,pause,player-collection,scale,sprint-cards,startup-guide,workbench}.ts',
        'src/ui/terminal/terminal.ts', // DOM interaction and HTML rendering
      ],
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { perFile: true, lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
