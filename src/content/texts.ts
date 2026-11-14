import type { Lane, Tier } from '../systems/run/run';

/** The words of the sheet. Dry on purpose: the joke is in what is said, never in how. */

export const LANE_NAME: Record<Lane, string> = {
  build: 'стройка',
  fix: 'починка',
  promo: 'продвижение',
  research: 'разведка',
};

/** «проверяешь стройку» */
export const LANE_ACC: Record<Lane, string> = {
  build: 'стройку',
  fix: 'починку',
  promo: 'продвижение',
  research: 'разведку',
};

export const TIER_NAME: Record<Tier, string> = {
  fast: 'быстрый',
  normal: 'обычный',
  think: 'думающий',
};

export const TIER_TITLE: Record<Tier, string> = {
  fast: 'Быстрый агент',
  normal: 'Обычный агент',
  think: 'Думающий агент',
};

export const TIER_NOTE: Record<Tier, string> = {
  fast: 'много кода, много долга',
  normal: 'пишет как человек: средне',
  think: 'медленно, дорого, зато без долга',
};

export const STAGE_NAME = ['', 'кухня', 'первые клиенты', 'город клиентов'];

/** What a client says when it leaves without the block it waited for; `%s` — the short name of the block. */
export const LEFT_KNOWN = ['«без %s нам не подходит»', '«мы просили %s ещё в прошлом спринте»', '«у конкурентов %s уже есть»'];
export const LEFT_UNKNOWN = ['ушёл, не сказав почему', '«мы пересмотрели приоритеты»', '«дело не в вас, дело в бюджете»'];

/** The news line: the industry talks to itself. Shown in turn, between the events of the run. */
export const NEWS: readonly string[] = [
  'Клод научился делать это сам. Четыреста стартапов узнали об этом из рассылки',
  'Исследование: 90% ИИ-стартапов — это поле ввода и надежда',
  'Основатель месяц выбирал название. Домен оказался занят',
  'Аналитики: рынок обёрток над ИИ достиг зрелости — в нём появились обёртки над обёртками',
  'Стартап привлёк ноль долларов и гордо называет это независимостью',
  'Новый тренд: писать «мы не обёртка» мелким шрифтом на лендинге',
  'Опрос: 73% пользователей не знают, чем ИИ-продукт отличается от чата. Основатели — тоже',
  'Поставщик модели поднял цены. Юнит-экономика отрасли вышла покурить',
  'Пост «Как я заработал первый доллар» собрал больше лайков, чем сам продукт — клиентов',
  'Эксперты советуют «строить на виду». Конкуренты согласны и смотрят',
  'В отрасли дефицит: слово «революционный» закончилось ещё в марте',
  'Стартап добавил ИИ в название и поднял цену вдвое. Продукт не менялся',
  'Основатель ответил в поддержку сам и назвал это «белым сервисом»',
  'Таблица в Excel по-прежнему главный конкурент любого B2B SaaS',
  'Клиент попросил скидку 90% «за отзыв». Отзыв обещает написать Клод',
  'Вышел 412-й агрегатор ИИ-инструментов. Он агрегирует первые 411',
];

/** Said once, when something happens for the first time. */
export const NEWS_EVENT = {
  firstBlock: 'На чьей-то кухне заработала обёртка над Клодом. Мир пока не заметил',
  firstClient: 'У стартапа первый клиент. Это знакомый основателя, но в презентации он будет «ранним последователем»',
  firstPay: 'Первый платёж. Основатель сделал скриншот и уже пишет пост',
  firstLeft: 'Стартап потерял клиента и узнал слово «отток»',
  down: 'Продукт лежит. В статусе написано «работаем над улучшениями»',
  stage3: 'Стартапом заинтересовались компании с отделом закупок. Это надолго',
  profit: 'Стартап вышел в плюс. Основатель срочно ищет, что бы ещё построить',
  link: 'Два блока встали рядом и стали называться «платформой»',
};

/** The founder's own words on the release card, by what happened. */
export function releaseLines(r: {
  sprint: number;
  shipped: string[];
  came: number;
  left: number;
  reasons: string[];
  mrr: number;
  tokens: number;
  debt: number;
  down: boolean;
}): string[] {
  const lines = [`<b>❯ релиз · спринт ${r.sprint}</b>`];
  if (r.shipped.length > 0) lines.push(`выпущено: ${r.shipped.join(', ')}`);
  else lines.push('<span>выпущено: ничего. Зато стабильно</span>');
  if (r.came > 0 || r.left > 0) {
    const came = r.came > 0 ? `<em>+${r.came}</em> ${r.came === 1 ? 'клиент' : 'клиента'}` : 'новых клиентов нет';
    const left = r.left > 0 ? ` · <strong>−${r.left}</strong> ${r.reasons[0] ? `ушёл: нет «${r.reasons[0]}»` : 'ушёл молча'}` : '';
    lines.push(came + left);
  }
  lines.push(`подписки <em>$${Math.round(r.mrr)}</em> · токены −$${Math.round(r.tokens)}`);
  if (r.down) lines.push('<strong>продукт лежит весь спринт: никто не платит</strong>');
  else if (r.debt >= 20) lines.push(`<strong>долг ${Math.round(r.debt)} — следующий релиз может всё уронить</strong>`);
  else if (r.debt >= 8) lines.push(`<span>долг ${Math.round(r.debt)} — держится на честном слове</span>`);
  return lines;
}
