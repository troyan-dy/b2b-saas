# Scope — the contract in numbers

What "the game is done" means for this project. The scale is agreed in phase 1,
the numbers are refined in phase 8. Lines are never deleted — they are ticked or marked
`BLOCKED: <why>`. Counted by `scope.py`.

Line syntax:

    - [x] <name>: <N> <unit> — count: <command that prints a number>

## Reference inventory
Game Dev Tycoon: 4 офиса от гаража, десятки тем × 6 жанров с постоянной таблицей совместимости, одна карьера на 30–35 игровых лет (6–10 часов). Yes-Driven Development: 6 экранов-масштабов, около 2 часов до финала.

## Contract
- [x] карты идеи (6 ИИ-приёмов, 8 форм, 8 аудиторий): 22 pcs — count: node tools/count.mjs cards
- [x] блоки продукта: 20 pcs — count: node tools/count.mjs blocks
- [x] события-новости: 40 pcs — count: node tools/count.mjs news
- [x] типы клиентов: 5 pcs — count: node tools/count.mjs clients
- [x] тарифы агентов: 3 pcs — count: node tools/count.mjs tiers
- [x] этапы (кухня, первые клиенты, город клиентов): 3 pcs — count: node tools/count.mjs stages
- [x] концовки: 3 pcs — count: node tools/count.mjs endings
- [x] уроки опыта основателя: 12 pcs — count: node tools/count.mjs lessons
