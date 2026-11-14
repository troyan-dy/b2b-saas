# Technology — B2B SaaS

<!-- Phase 3 (references/stack.md). ENGINE — one of: godot, godot-mono, unity,
unreal, web, defold, bevy (read by studio.py and envcheck.py). DIMENSION — 2D or 3D
(2.5D with 3D models is 3D); envcheck.py recommends Blender for 3D. -->
ENGINE: web
ENGINE VERSION: Phaser 4.2.1
DIMENSION: 2D
LANGUAGE: TypeScript
PLATFORMS: web — браузер на ПК (площадку назовём к выпуску)

## Decision
- context: 2D тайкун забегами в браузере на ПК; чертёж в изометрии с отъездом камеры по трём этапам, сотни квадратов, терминал, панель и диалоги текстом; стиль уже реализован в Yes-Driven Development
- options: Phaser 4 — стиль YDD написан на нём, код переносится / движок тяжелее, чем нужно тайкуну; PixiJS 8 — лёгкий рендер / сцены, твины, звук и чертёж писать заново; HTML + SVG без движка — резкий вектор, крошечная сборка / квадраты и камера под вопросом, код YDD не переносится
- choice and why: Phaser 4.2.1 + TypeScript 6.0.x + Vite — переносим из clicker-game палитру, терминал, чертёж, квадраты и съёмку кадров; первая сцена в стиле за часы (выбор пользователя)
- consequences: графика — SVG и процедурная отрисовка; текст, панель и диалоги — HTML-слой поверх канваса; сборка `npm run build` в `dist/`; API сверять с `node_modules/phaser/types` и `node_modules/phaser/skills`, а не с памятью о Phaser 3

## Budgets
- 60 fps на среднем ноутбуке; в худший момент (этаж, все агенты, ≥ 1000 квадратов в кадре) fps_min ≥ 50
- draw calls ≤ 100; память вкладки ≤ 300 МБ
- сборка ≤ 5 МБ начальной загрузки, старт до первого действия ≤ 3 с
- сохранение ≤ 100 КБ в localStorage
- замер 2026-11-15, настоящее окно Chromium, третий этап, 12 клиентов, 20 блоков, скорость ×16 (`captures/polish/perf`): fps_min 275, память JS 42 → 47 МБ за забег, ошибок 0; сборка `dist/` 5,7 МБ целиком, из них музыка 2,9 МБ грузится после первого нажатия

## Project structure
- `index.html`, `src/main.ts` — вход: читает `?seed=&gym=&state=&debug=`, запускает Phaser
- `src/core/` — RNG с сидом, аргументы запуска, метрики, звук, настройки
- `src/systems/` — механики без рендера: папка на механику из DESIGN.md
- `src/view/` — сцены Phaser и «сок»: читают состояние, ничего не решают
- `src/ui/` — HTML-слой: деньги, панель агентов, терминал, новости; шлёт намерения
- `src/data/` — все числа (JSON) и палитра; `src/content/` — слова питча, новости, реплики
- `src/gyms/` — тестовые сцены механик; `src/debug/` — панель тюнинга, только в dev
- `tests/` — Vitest, только формулы и сохранения; `tools/capture.mjs` — снимки кадров
