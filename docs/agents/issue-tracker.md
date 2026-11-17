# Issue tracker: GitHub

Задачи и спецификации инженерных навыков живут в GitHub Issues репозитория `troyan-dy/b2b-saas`:
https://github.com/troyan-dy/b2b-saas/issues

Используй установленный `gh`; в командах явно указывай `--repo troyan-dy/b2b-saas`.
Тексты задач и комментариев пиши по-русски. Многострочный текст сохраняй в UTF-8 файл
и передавай через `--body-file`, сохраняя настоящие переводы строк.

## Conventions

Общая карта текущего бэклога — закреплённая GitHub issue #21. При сверке сопоставляй диалог,
локальные записи и открытые/закрытые issues: каждому пункту нужна ссылка либо явная отметка
«выполнено», «отменено» или «гипотеза». `.studioigor/BACKLOG.md` — указатель, не отдельная очередь.

Перед изменением кода заведи или выбери issue, запиши критерий готовности и назначь исполнителя. Ведущий чат собирает релиз; независимые задачи выполняются агентами в отдельных worktrees с короткими отчётами. Связанные задачи можно объединить в рабочую ветку, сохраняя отдельные issues и результаты проверок.

Если решение о вкусе, масштабе или поведении не принято, задай вопрос и отметь `needs-info`; самостоятельно выбирай его только при явном делегировании пользователем. Подтверждённые решения не переспрашивай. Перед завершением запиши проверку в issue и обнови общую карту релиза.

- Создать: `gh issue create --repo troyan-dy/b2b-saas --title "..." --body-file <file>`.
- Прочитать: `gh issue view <number> --repo troyan-dy/b2b-saas --json number,title,body,labels,comments`.
- Список: `gh issue list --repo troyan-dy/b2b-saas --state open --limit 100 --json number,title,body,labels,comments`; применяй нужные фильтры состояния и меток, учитывай лимит и пагинацию.
- Комментарий: `gh issue comment <number> --repo troyan-dy/b2b-saas --body-file <file>`.
- Изменить описание: `gh issue edit <number> --repo troyan-dy/b2b-saas --body-file <file>`.
- Метки: `gh issue edit <number> --repo troyan-dy/b2b-saas --add-label "..." --remove-label "..."`; используй отображение из `docs/agents/triage-labels.md`.
- Закрыть: `gh issue close <number> --repo troyan-dy/b2b-saas`.
- Создать дочернюю задачу: `gh issue create --repo troyan-dy/b2b-saas --parent <parent> --title "..." --body-file <file>`.
- Присоединить существующую: `gh issue edit <parent> --repo troyan-dy/b2b-saas --add-sub-issue <child>`.
- Если дочерние задачи недоступны, укажи `Part of #<parent>` в начале дочерней задачи и добавь её в список родительской.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub использует общую нумерацию issues и PR. Для неоднозначного `#42` сначала проверь
`gh pr view 42 --repo troyan-dy/b2b-saas`, затем при отсутствии PR читай issue.

## When a skill says "publish to the issue tracker"

Создай GitHub issue. Существующий игровой бэклог и решения `.studioigor/` сохраняют свою роль;
при заведении инженерной задачи ссылайся на исходную запись.

## When a skill says "fetch the relevant ticket"

Прочитай issue вместе с описанием, метками и комментариями.

## Wayfinding operations

- Карта работы — одна issue с меткой `wayfinder:map` и разделами Notes / Decisions-so-far / Fog.
- Дочерние задачи — sub-issues карты с типом `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` или `wayfinder:task`. При недоступности sub-issues используй ссылки, описанные выше.
- Зависимости — native issue dependencies. Числовой database id блокирующей задачи получай через `gh api repos/troyan-dy/b2b-saas/issues/<n> --jq .id`; это не её номер `#n`.
- Добавить блокировку: `gh api --method POST repos/troyan-dy/b2b-saas/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Если API недоступен, используй строку `Blocked by: #<n>`.
- Следующая задача — первая по порядку карты открытая дочерняя задача без исполнителя и открытых блокировок. Учитывай `issue_dependencies_summary.blocked_by` или состояния задач из `Blocked by`.
- Забрать задачу: `gh issue edit <n> --repo troyan-dy/b2b-saas --add-assignee @me` перед работой.
- Завершить: записать результат комментарием через `--body-file`, закрыть issue и добавить ссылку на результат в Decisions-so-far карты.
