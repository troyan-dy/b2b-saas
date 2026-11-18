import { BLOCK_BY_ID } from '../content/blocks';
import { HAND_NAME } from '../content/texts';
import { L } from '../core/lang';
import { companyTotals, customerCount } from '../systems/company/company';
import { activeWork, isLive, TUNING, valuation, type Run } from '../systems/run/run';
import { money, PER_S, plural, rate } from '../ui/format';

export function nextStep(run: Run, net: number, mode: { paused: boolean; razing: boolean; picked: boolean }): string {
  const has = (kind: string): boolean => run.blocks.some((block) => block.kind === kind);
  if (run.draft) return L('Выбери <b>одну из трёх карт</b>: время и деньги стоят до решения.', 'Choose <b>one of three cards</b>: time and money wait for your decision.');
  if (mode.razing) return L('<b>Разобрать здание</b>: клик или Enter. Его клиенты снова начнут ждать.', '<b>Demolish building</b>: click or press Enter. Its customers will wait again.');
  if (mode.picked) return L('<b>Выбери свободную клетку</b>: клик или Tab и Enter. Подсвеченное соседство увеличит доход после выпуска.', '<b>Choose a free cell</b>: click, or use Tab and Enter. Highlighted neighbors increase income after release.');
  const task = activeWork(run) ?? run.tasks.find((entry) => entry.status === 'queued');
  if (task?.status === 'queued' && run.money < task.cost) return L(
    'Для старта ' + (task.kind === 'infrastructure' ? 'инфраструктуры' : 'работы') + ' не хватает <b>' + money(task.cost - run.money) + '</b>. Измени очередь, отложи или отмени работу.',
    (task.kind === 'infrastructure' ? 'Infrastructure' : 'Work') + ' needs <b>' + money(task.cost - run.money) + '</b> more to start. Reorder, defer or cancel it.',
  );
  if (!task && run.tasks.some(entry => entry.status === 'ready')) return L('<b>Работа готова и ждёт релиза</b>. Выпущенное улучшение заработает после отсчёта.', '<b>Work is ready and waiting for release</b>. The upgrade activates when the countdown ends.');
  if (!task && run.tasks.some(entry => entry.status === 'backlog')) return L('<b>Работа отложена</b>: не выполняется. Нажми ▶ над работой, чтобы вернуть её в очередь; отложенные здания сохраняют клетки.', '<b>Work is deferred</b>: no progress. Press ▶ above the task to resume; deferred buildings keep their cells.');
  if (mode.paused) return L('<b>Пауза</b>: время, работа и деньги стоят.', '<b>Paused</b>: time, work and money are stopped.');
  if (task && !run.agents.some(agent => agent.lane === 'build')) return L(
    `<b>На стройке нет агента</b>. Назначь строителя или нажми <b>«${HAND_NAME.build}»</b> справа внизу · 1 сила.`,
    `<b>No agent is building</b>. Assign a builder or press <b>“${HAND_NAME.build}”</b> at the bottom right · 1 energy.`,
  );
  if (!has('core')) return L(`Выбери <b>«${BLOCK_BY_ID.core.name}»</b> справа, затем клетку на чертеже.`, `Pick <b>“${BLOCK_BY_ID.core.name}”</b> on the right, then choose a cell on the blueprint.`);
  if (!has('landing')) return L('Поставь <b>«Лендинг»</b>: без него клиенты не найдут продукт.', 'Place the <b>“Landing Page”</b> so customers can find your product.');
  if (!has('pay')) return L('Поставь <b>«Приём оплаты»</b>: он включает подписки после выпуска.', 'Place <b>“Payments”</b>: it enables subscriptions after release.');
  if (run.down) return run.downWhy === 'supplier'
    ? L('<strong>Сбой поставщика</strong> до релиза: клиенты не платят. Можно пока улучшить продукт.', '<strong>Provider outage</strong> until release: customers are not paying. Improve your product while you wait.')
    : L('<strong>Продукт лежит</strong>: назначь агента на починку, снизь техдолг к следующему релизу.', '<strong>The product is down</strong>: assign an agent to fixes and reduce tech debt before release.');
  if (!isLive(run, 'pay')) return L(
    `<b>Платежи ещё не выпущены</b>. Помоги стройке кнопкой <b>«${HAND_NAME.build}»</b> справа внизу. Готовые проекты включатся на релизе.`,
    `<b>Payments have not shipped yet</b>. Use <b>“${HAND_NAME.build}”</b> at the bottom right to help build. Completed projects activate at release.`,
  );
  const totals = companyTotals(run);
  if (totals.utilization > 1) return L(
    '<strong>Перегруз ' + Math.round(totals.utilization * 100) + '%</strong>: расширь «Инфраструктуру» справа. Выпуск — на релизе; деньги ускоряют строителей.',
    '<strong>Load ' + Math.round(totals.utilization * 100) + '%</strong>: expand “Infrastructure” on the right. Ships at release; money speeds up builders.',
  );
  if (task && !task.block) return L(
    `Основатель расширяет компанию. Чтобы помочь, нажми <b>«${HAND_NAME.build}»</b> справа внизу.`,
    `The founder is expanding the company. Press <b>“${HAND_NAME.build}”</b> at the bottom right to help.`,
  );
  if (customerCount(run) === 0) return L('После выпуска ядра и лендинга придут первые клиенты. <b>Продвижение</b> пополняет воронку, нужные функции помогают им остаться.', 'The first clients arrive after core and landing ship. <b>Promotion</b> fills the funnel; useful features help them stay.');
  if (net < 0) return L(
    `До прибыли не хватает <b>${rate(-net)}${PER_S}</b>. Нажми <b>«Клиенты»</b> на карте или на их здания: там запросы, сроки и выручка.`,
    `<b>${rate(-net)}${PER_S}</b> short of profit. Click <b>“Clients”</b> on the map or their buildings for needs, deadlines and revenue.`,
  );
  if (run.sprint === TUNING.last_sprint) return L(
    '<em>Последний спринт</em> · выпусти готовые улучшения. После релиза — итог компании.',
    '<em>Final sprint</em> · ship your ready upgrades. The company result follows this release.',
  );
  return L(
    '<em>В плюсе</em> · оценка ' + money(valuation(run)) + '. Новый уровень остаётся в своей клетке; новые модули выбирай под потребности клиентов.',
    '<em>In the black</em> · valuation ' + money(valuation(run)) + '. Upgrades stay in their cells; choose new modules around client needs.',
  );
}

/** «3 спринта» */
export function sprints(n: number): string {
  return `${n} ${plural(n, L(['спринт', 'спринта', 'спринтов'], ['sprint', 'sprints', 'sprints']))}`;
}
