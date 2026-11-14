# Environment — research (2026-11-14)

Стек: Phaser 4 + TypeScript + Vite, браузер на ПК. Машина: Windows 11, Node 24.22.1, npm 11.19.1.
За основу взято вчерашнее исследование для Yes-Driven Development
(clicker-game/.studioigor/research/environment.md, 2026-11-13); ниже — что перепроверено сегодня.

## Findings
- Версии из `npm view <пакет> version` (2026-11-14): phaser 4.2.1, vite 8.3.8, typescript 7.0.2,
  vitest 5.1.0, playwright 1.65.1, eslint 10.15.0, typescript-eslint 8.72.2.
- typescript-eslint 8.72.2 по-прежнему объявляет peer `typescript >=4.8.4 <6.1.0` — TypeScript
  закреплён на ~6.0.3.
- `npm install` с тем же набором пакетов, что в YDD, прошёл без ошибок; `npx playwright install
  chromium` поставил headless shell 159 (ревизия 1255).
- Пакет phaser 4.2.1 содержит документацию для агентов: `node_modules/phaser/skills/` (темы:
  cameras, tweens, particles, v3-to-v4-migration и другие) и `node_modules/phaser/docs/`.
- Редакторного MCP у веб-стека нет. Phaser Editor v5 и Game Agent (принятое улучшение
  P-20261113-04) требуют входа в аккаунт — на автопилоте не ставятся; кадры снимает
  `tools/capture.mjs`, браузер для агента — Claude in Chrome.
- ffmpeg 9.0.2 и ImageMagick 7.1.2 стоят с прошлого проекта (winget), но в PATH текущей сессии
  не попали — пути записаны в ENV.md → Pitfalls.
- `autopilot.py` на Windows не запускается (нет модуля `fcntl`) — автопилот идёт циклом внутри
  сессии с заданием CronCreate.
- Командные ворота студии (`test -s`, `grep -q`, `ls`) на Windows проверяются, если добавить в
  PATH `C:\Program Files\Git\usr\bin`.

## What this changes
- Каркас проекта перенесён из clicker-game: конфиги, `tools/capture.mjs`, RNG, метрики, звук,
  панель тюнинга, квадраты; палитра и базовые стили написаны заново по арт-библии.
- Dev-сервер на порту 5174, чтобы не пересекаться с YDD.
- Ворота «envcheck exit 0» на Windows недостижимы из-за brew — закрываются пометкой, фактическая
  проверка — `studio.py verify`.

## Sources
- `npm view` и `npm ls --depth=0` на этой машине (2026-11-14)
- вывод `npm install` и `npx playwright install chromium` (2026-11-14)
- clicker-game/.studioigor/research/environment.md и ENV.md (2026-11-13)
