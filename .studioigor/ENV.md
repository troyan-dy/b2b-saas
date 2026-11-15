# Environment — B2B SaaS

<!-- Phase 4 (references/environment.md). Commands verified by a real run.
VERIFIED is switched only by `studio.py verify`. CAPTURE writes images to
.studioigor/captures/. -->
VERIFIED: yes

## Installed
| tool | version | why |
|---|---|---|
| Node + npm | 24.22.1 / 11.19.1 | сборка и запуск |
| Phaser | 4.2.1 | движок (2D, WebGL) |
| Vite | 8.3.8 | dev-сервер (порт 5174) и сборка в `dist/` |
| TypeScript | 6.0.3 | язык; 7.x пока не поддержан typescript-eslint (нужен < 6.1) |
| Vitest | 5.1.0 | тесты формул и сохранений |
| Playwright + Chromium | 1.65.1 / headless shell 159 | снимки кадров без человека (`tools/capture.mjs`) |
| ESLint + typescript-eslint | 10.15.0 / 8.72.2 | линтер |
| Prettier | 3.10.1 | форматирование |
| ZzFX | 1.4.0 | звуки кодом, единая точка `playSound` |
| lil-gui | 0.21.0 | панель настроек в тестовых сценах |
| шрифты Fontsource | 5.3.x | JetBrains Mono, Source Serif 4 (кириллица) |
| git + git-lfs | 2.56.0 / 3.8.1 | версии; LFS для картинок, звука, шрифтов |
| Python | 3.12.16 | скрипты студии |
| ffmpeg | 9.0.2 (winget Gyan.FFmpeg) | звук, нарезка клипов |
| ImageMagick | 7.1.2 (winget) | палитры, контактные листы |

## Agent integrations
- документация Phaser 4 для агента лежит в пакете: `node_modules/phaser/skills/<тема>/SKILL.md` и `node_modules/phaser/docs/` — читать перед кодом новой подсистемы
- кадры игры: `tools/capture.mjs` (Playwright, расписание ввода, ошибки консоли → exit 1, `window.__metrics` → metrics.json) — проверено на сцене hello
- браузер для агента: расширение Claude in Chrome; Playwright MCP не ставился — команда `claude` недоступна в PATH этой среды (VS Code)
- редактора у веб-стека нет: весь проект — код в репозитории
- тестовые сцены: `http://localhost:5174/?gym=<имя>`; `&debug=1` включает оверлей; клавиша P пишет настройки в `.studioigor/captures/tuning/` через dev-сервер
- эскизы интерфейса: `node tools/shot.mjs <файл.html> <out.png>`
- картинки README на двух языках → `docs/img/<lang>/`: `npm run build:gym && node tools/readme.mjs` (плакаты — `art/readme/*.html`, кадры — забег бота `tools/inputs/tour.json`; номера кадров — `FRAMES` в скрипте)
- язык игры в съёмке: `?lang=ru` или `?lang=en` в адресе (headless Chromium без него открывает английский)
- две сборки: `npm run build` → `dist/` — релиз без тестовых сцен; `npm run build:gym` → `dist-gym/` — с ними, для съёмки (`tools/capture.mjs --dir dist-gym`)

## Commands
RUN: npm run dev -- --open
TEST: npx tsc --noEmit && npx vitest run
BUILD: npm run build
CAPTURE: npm run build:gym && node tools/capture.mjs --dir dist-gym --url "/?gym=hello" --out .studioigor/captures/hello --duration 5 --every 1 --inputs tools/inputs/hello.json --wait-for "window.__GAME__?.ready" --seed 7
EDITOR: none — the code is in the repository

## Pitfalls
- Windows: скрипты студии запускать с `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` и `C:\Program Files\Git\usr\bin` в PATH — тогда командные ворота (`test`, `grep`, `ls`) проверяются сами
- Windows: `refs.py` и `autopilot.py` импортируют `fcntl` — refs.py запускать с заглушкой на PYTHONPATH, автопилот идёт циклом внутри сессии (autopilot/RUN.md)
- Windows: `board.py serve` запускать без `--open`, ссылку открывать через `Start-Process`
- envcheck.py требует brew — на Windows его роль выполняют winget и npm
- ffmpeg и magick не в PATH этой сессии: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_…\ffmpeg-9.0.2-full_build\bin` и `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI`
- fps в headless-съёмке занижен (программный WebGL) — производительность мерить в настоящем окне
- TypeScript `erasableSyntaxOnly`: нельзя enum и параметры-свойства в конструкторе
- API сверять с `node_modules/phaser/types/phaser.d.ts`: модель помнит Phaser 3 (`setTintFill`, `preFX/postFX`, `Geom.Point`, `Math.PI2` в 4-й версии убраны)
- PowerShell 5.1 не знает `&&`: цепочки команд — через `;` и проверку `$LASTEXITCODE`; команды из ENV.md рассчитаны на cmd (их так запускает `studio.py verify`)
- порт dev-сервера 5174: 5173 занят Yes-Driven Development
