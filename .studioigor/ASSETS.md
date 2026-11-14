# Assets — B2B SaaS

<!-- Phase 5 (references/assets.md). -->

## Inventory
<!-- one line per asset card (references/assets.md): name · category · style · budget · source · status -->
| asset | category | style | budget | source | status |
|---|---|---|---|---|---|
| A001 CH_Founder | персонаж | основатель за столом с ноутбуком, тонкая линия, изометрия | desk.webp, высота показа ~196 px | картинка YDD (генерация) | done |
| A002 CH_Claude | персонаж | Клод: коралловый квадрат с двумя глазами — на экранах ноутбуков, в терминальной карточке, на ядре продукта | код | код (Graphics, CSS) | done |
| A003 ND_Agent | узел | ноутбук агента на столике с Клодом на экране | laptop.webp, ~118 px | картинка YDD (генерация) | done |
| A004 ND_Blocks | узлы-герои | блоки продукта: изометрические модули 2:1, значок на верхней грани, подпись на боковой; стройка — пунктир с коралловыми квадратами; долг — серые квадраты на правой грани | код, 12 видов | код (src/view/iso.ts, src/content/blocks.ts) | wip |
| A005 ND_Clients | узлы | здания клиентов по отраслям: клиника, барбершоп, кофейня, пиццерия, гараж, школа, ферма, стройка, банк, завод и другие | *.webp, ~128 px | картинки YDD (генерация) | done |
| A006 EN_Paper | окружение | бумага чертежа с точечной сеткой | код | код (src/ui/paper.css) | done |
| A007 VFX_Squares | VFX | коралловые квадраты работы по связям и в блок; зелёные квадраты подписок в счётчик | пул ≤ 600 | код (src/view/board.ts, squares.ts) | done |
| A008 VFX_ZoomOut | VFX | отъезд камеры по этапам: лист сжимается вокруг продукта | код | код (Board.zoomTo) | plan |
| A009 UI_Money | UI | деньги и запас хода: сериф, зелёные; расход — тушью с минусом | HTML/CSS | код | done |
| A010 UI_Shelf | UI | правая панель: блоки, агенты, клавиши направлений | HTML/CSS | код | done |
| A011 UI_Term | UI | тёмная терминальная карточка: метрики релиза, звонки клиентов | HTML/CSS | код | wip |
| A012 UI_Tags | UI | подписи узлов, моноширинные; подпись блока — на грани с наклоном | HTML/CSS | код | done |
| A013 UI_News | UI | строка новостей внизу | HTML/CSS | код | done |
| A014 UI_Terminal | UI-герой | полноэкранный терминал: смесь идеи, меню, некролог | HTML/CSS | код | plan |
| A015 FNT | шрифты | JetBrains Mono 400/700, Source Serif 4 400/600, кириллица | woff2 | Fontsource (OFL) | done |
| A016 SFX | звук | блок поставлен, квадрат дошёл, релиз, клиент пришёл и ушёл, падение, банкротство | параметры в коде | ZzFX | plan |
| A017 MUS | музыка | спокойный зацикленный лоу-фай «In the Lobby» | ≤ 3 МБ | CC0, OpenGameArt (из YDD) | plan |

## Strategy by category
| category | source (pack / Blender / procedural / generation / user) | why | status |
|---|---|---|---|
| персонажи, здания, предметы | готовые картинки YDD (генерация пользователя) | тот же стиль и автор, новых не нужно; клиент выглядит как его отрасль | agreed (proxy) |
| блоки продукта | procedural: изометрия кодом | блоков много и они меняются по состоянию: стройка, долг, готов | agreed (proxy) |
| VFX | procedural: Graphics и пул квадратов | квадраты — фирменный приём, нужен полный контроль | agreed (proxy) |
| UI | procedural: HTML/CSS | чёткий текст, вёрстка как в YDD | agreed (proxy) |
| шрифты | pack: Fontsource, OFL | кириллица, ставятся через npm | agreed (proxy) |
| SFX | procedural: ZzFX | параметры в коде, высоту меняем на лету | agreed (proxy) |
| музыка | pack: CC0 «In the Lobby» из YDD — до решения пользователя | бесплатно и уже проверено в YDD; трек — вопрос вкуса | agreed (proxy) |

## Conventions
- единицы — пиксели листа 1920×1080; картинки якорятся низ-центр и масштабируются по высоте показа
- имена файлов — ASCII в нижнем регистре: `public/assets/img/nodes/<имя>.webp`, ключ текстуры `node_<имя>`
- цвета только из палитры ART_BIBLE (`src/data/palette.ts`, `src/ui/style.css`); коралловый — только Клод и работа, зелёный — только деньги
- блок: слова и значок — `src/content/blocks.ts`, числа — `src/data/balance/`; значок задаётся ломаными в координатах верхней грани 0..1
- линия модуля: внешний контур 3 px, внутренние рёбра 1,5 px, значок 2,5 px; связи 2 px со стрелкой
- текст не рисуется в canvas: подписи — HTML-слой над ним, деньги и панель — под ним
- звук: единая точка `playSound(name)`, параметры ZzFX в `src/core/sound.ts`
- каждый новый ассет сначала ставится в сцену вида (`?gym=lookdev`) и снимается

## Requests to the user
- музыка: подтвердить «In the Lobby» или выбрать другой трек
- новые картинки (если захочется отдельных значков для блоков или персонажей клиентов) — генерация на аккаунте пользователя

## License registry
| asset / pack | source (URL) | license | author | path | attribution |
|---|---|---|---|---|---|
| Phaser 4.2.1 | https://github.com/phaserjs/phaser | MIT | Phaser Studio Inc. | node_modules/phaser | в титрах |
| картинки основателя, ноутбука и зданий | generated (Codex image_gen, аккаунт пользователя; сделаны для Yes-Driven Development) | generated:true | — | public/assets/img/nodes/ | не требуется |
| JetBrains Mono | https://www.npmjs.com/package/@fontsource/jetbrains-mono | OFL-1.1 | JetBrains | node_modules/@fontsource/jetbrains-mono | в титрах |
| Source Serif 4 | https://www.npmjs.com/package/@fontsource/source-serif-4 | OFL-1.1 | Adobe | node_modules/@fontsource/source-serif-4 | в титрах |
| ZzFX | https://github.com/KilledByAPixel/ZzFX | MIT | Frank Force | node_modules/zzfx | в титрах |
| lil-gui (только dev-панель настроек) | https://github.com/georgealways/lil-gui | MIT | George Michael Brower | node_modules/lil-gui | не входит в сборку игры |
