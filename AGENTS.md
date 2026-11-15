# B2B SaaS — project rules (studioigor)

The game "B2B SaaS" is built with the studioigor pipeline. The agent leads the user step by step
from idea to release; the user decides taste and direction and plays often. Run the
pipeline work through the studioigor skill (`<skill>/SKILL.md`, phase rules in
`<skill>/references/`).

## Claude Code и Codex

- Перед инженерными задачами читай конфигурацию навыков из `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` и `docs/agents/domain.md`. Общий указатель — раздел `Agent skills` в `CLAUDE.md`.

- Общие правила проекта находятся в этом `AGENTS.md`. Отвечай пользователю по-русски.
- `<skill>` — каталог установленного `studioigor`. В Codex возьми путь из списка навыков,
  обычно `~/.codex/skills/studioigor` (при заданном `CODEX_HOME` — `$CODEX_HOME/skills/studioigor`).
  В Claude Code используй каталог загруженного навыка, обычно `~/.claude/skills/studioigor`.
  Перед командой подставь полный путь и заключи его в кавычки.
- На Windows запускай Python через `python`, на macOS/Linux — через доступный `python3`.
  В командах ниже `python` обозначает проверенный интерпретатор текущей платформы.
  Для скриптов студии включай UTF-8 через `-X utf8`.
  При `uv trampoline failed ... permission denied` используй штатный механизм клиента
  для запуска конкретной Python-команды с повышенными разрешениями. В Windows sandbox
  каталог интерпретатора `uv` в профиле пользователя может быть недоступен.
- Названия инструментов Claude в навыке и ролях сопоставляй доступным инструментам текущего
  клиента. В Codex чтение и поиск файлов выполняй через shell (`rg`, `Get-Content`), правки —
  через `apply_patch`, просмотр локальных кадров — через `view_image`, поиск в интернете —
  через доступный web-инструмент. Инструкции навыка читай из установленного каталога.
- `AskUserQuestion` в Codex означает доступный инструмент вопросов пользователю.
  Если его нет, задай вопрос в чате. Вариант «реши сам» доступен для решений о вкусе.
- Настройки Codex находятся в `.codex/config.toml`, восемь ролей — в `.codex/agents/*.toml`.
  Их инструкции загружают общие описания из `.claude/agents/*.md`. YAML-поля `tools`,
  `isolation` и `color` этих Markdown-файлов обрабатывает Claude Code.
- Для независимых задач с разными файлами или отдельного ревью используй сабагентов,
  максимум три одновременно. В Codex выбирай роль по `name` из её TOML-файла.
  Передай цель, критерии приёмки, разрешённые файлы, базовый коммит и абсолютный рабочий путь.
  Дождись результата, проверь изменения на диске и выполни проверку готовности.
- В Codex при наличии встроенной изоляции используй её. Иначе ведущий создаёт ветку
  от текущего локального HEAD через `git worktree add -b <branch> <path> HEAD`, например
  в `.codex/worktrees/<task>`, и передаёт абсолютный путь сабагенту. Все его shell-команды
  и правки должны явно указывать этот worktree. Убедись, что клиент разрешает запись туда.
  Общие изменения должны быть закоммичены до создания worktree.
- Проверка изоляции для обеих платформ — `git worktree list --porcelain` подтверждает
  переданный путь как отдельный worktree, `git -C <path> rev-parse HEAD` совпадает с базой.
  Исследование и ревью допускаются в основном checkout в пределах задачи.
- `CronCreate` и `/loop` из навыка относятся к клиенту, в котором эти функции доступны.
  Встроенный `autopilot.py` использует `claude -p` и POSIX-модуль `fcntl`.
  Для автопилота Codex используй цикл открытой сессии по `.studioigor/autopilot/RUN.md`,
  когда пользователь поручил автономную работу. Для работы после закрытия сессии
  сначала настрой реальный планировщик и исполнитель Codex.
  Статус автопилота подтверждай состоянием запущенного процесса или задания.

## Start of every session
1. `python -X utf8 "<skill>/scripts/studio.py" status` — shows the phase, open gates, what's
   next, learned items for this phase (accepted improvements and user preferences) and
   warnings. Do what it says.
2. Read `.studioigor/STATE.md`: "Now", open questions, session log.
3. What is recorded in `.studioigor/` (especially DECISIONS.md) is already decided: do not
   ask again and do not rebuild it. Trust the disk more than context memory.
4. `status` says "AUTOPILOT ACTIVE" and you are not an autopilot tick — do not edit the
   project: independent development is running. To intervene — `python "<skill>/scripts/autopilot.py" stop`.

If you are a subagent with a task from the lead — do not run `status`: it ticks gates and
changes files. Work on the task and return the contract from your role.

## Game first
- Effort and tokens go into the game itself: gameplay, feel, assets, levels, sound, story.
- Tests — only where a bug silently breaks the game: economy and damage formulas, saves,
  determinism, a bug that came back a second time. No UI tests, no coverage for coverage's sake.
- Documents — short one-line decision records. No README essays and no code docs.
- The main check is a CAPTURE frame you looked at yourself, and the user's playtest.
- Several steps in a row went into tests, docs or tools — return to the game.
- This is a game, not a tech demo: a goal, menu, progression, sound, story, win and loss. At
  a playtest the first question is "is it fun?".

## Questions to the user
- Ask only for decisions (taste, scale, direction, money, accounts, publishing) and
  via the current client's question tool: 1–4 questions, 2–4 options, the recommended one first
  marked "(Recommended)", "you decide" is always available.
- Find out facts (files, installed software, APIs, documentation) yourself.
- Record the decision: `studio.py decide "…" --by user|agent --why "…"`. The user
  stepped away (`/loop`) — don't ask, decide yourself `--by agent`. Autopilot (independent
  development) — taste decisions `--by proxy`, user gates `tick "…" --proxy`, rules in
  `<skill>/references/autopilot.md`.
- "Always do it this way" / "I don't like X" — right away
  `python "<skill>/scripts/learn.py" prefer "…"`: it stays in this game
  (`.studioigor/PREFERENCES.md`). `--global` only for a rule about how to work with the user
  in any game, never for this game's taste.

## Git
- Commit at every step (a decision, closed gates, a locked mechanic):
  `python "<skill>/scripts/studio.py" commit "…"`.
- Never push or publish unless the user asked for it.
- Subagents that change game files work in a git worktree (Claude Code uses `isolation: "worktree"`).
  The lead reviews the diff, merges one at a time and checks the game after each merge.
  `.claude/worktrees/` and `.codex/worktrees/` must be in .gitignore. The procedure is in
  `<skill>/references/team.md`, with the Codex adaptation above.
- Live Blender (blender-mcp) and the engine editor via MCP — main session only.
  Subagents work headless.

## Commands and code
- Verified commands live in `.studioigor/ENV.md`: RUN (the user sees the game), TEST,
  BUILD, CAPTURE (frames in `.studioigor/captures/`), EDITOR. Take them from there, don't make them up.
  A command changed — update ENV.md and run `studio.py verify`.
- The code standard is `<skill>/references/code.md`: tuning parameters in data files, simple
  architecture with nothing "for the future".
- Studio roles live in `.claude/agents/`: game-designer, art-director, tech-artist,
  gameplay-programmer, level-designer, sound-designer, narrative-designer, qa-tester.

## Do not touch
- Never edit the skill's files (`<skill>/SKILL.md`, `references/`, `scripts/`).
  Found a better way — `learn.py propose`; `status` will show what was accepted.
- Change the `.studioigor/` state through `studio.py` (decide, tick, note, commit) when
  there is a command for it.
