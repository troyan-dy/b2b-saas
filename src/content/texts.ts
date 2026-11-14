import effects from '../data/balance/effects.json';
import headlines from '../data/balance/headlines.json';
import type { ClientType, Lane, Tier } from '../systems/run/run';
import { rate } from '../ui/format';

const EFFECT_NAME: Record<string, string> = {
  word_of_mouth: 'сарафан',
  corp_pay: 'крупные платят',
  small_pay: 'малый бизнес платит',
  promo: 'продвижение',
  tokens: 'токены',
};

/** What a shipped block gives, in the words of the shelf: «продвижение ×1,5». Empty for a block that only stands there. */
export function effectLine(kind: string): string {
  const e = (effects as Record<string, Record<string, number>>)[kind];
  if (!e) return '';
  return Object.entries(e)
    .map(([k, v]) => (k === 'patience' ? `клиенты терпеливее на ${v} спр.` : `${EFFECT_NAME[k] ?? k} ×${String(v).replace('.', ',')}`))
    .join(' · ');
}

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

/** What the founder does with his own hands on each lane: a founder codes least of all. */
export const HAND_NAME: Record<Lane, string> = {
  build: 'кодить',
  fix: 'чинить',
  promo: 'пост',
  research: 'звонок',
};

/** said over the desk when there is nothing for the hands to do there */
export const HAND_IDLE: Record<Lane, string> = {
  build: 'строить нечего: выбери блок',
  fix: 'долга нет: чинить нечего',
  promo: 'показывать нечего: нужны ядро и лендинг',
  research: 'спрашивать некого или всё уже известно',
};

/** said where the square lands */
export const HAND_DONE: Record<Lane, string> = {
  build: '',
  fix: 'починил сам',
  promo: 'пост написан',
  research: 'позвонил клиенту',
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
export const NEWS: readonly string[] = headlines;

/** What is said when a client that is a startup itself closes; `%s` is not used: the name is on the sheet. */
export const LEFT_CLOSED = ['закрылся: деньги кончились раньше, чем у тебя', 'закрылся: «это был невероятный путь»', 'закрылся: основатель ушёл в найм'];

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
  /** `%s` — what was shown */
  demoOk: 'Демо-день: показали «%s», и оно не упало. Трое пришли посмотреть поближе: +3 лида',
  /** `%s` — who walked out */
  demoFail: 'Демо-день: показывать было нечего. %s вышел из созвона «на минутку» и не вернулся',
  hero: 'Основатель дописал обещанное за минуту до релиза. Клиент решил, что так и было задумано',
  haggleFail: 'Покупатель бросил трубку. Перезвонит через четыре спринта — если не найдёт обёртку подешевле',
};

export const LEFT_DEMO = ['ушёл с демо-дня: смотреть было не на что'];

/** What a client asks on a call, by the block it needs. The question is always about something that is not there. */
export const CALL_ASK: Record<string, string> = {
  bot: 'А поддержка у вас круглосуточная? Или опять «напишите нам на почту»?',
  dash: 'А дашборд есть? Мне нужно что-то показывать на планёрке.',
  dark: 'У вас есть тёмная тема? Без неё наши разработчики отказываются это открывать.',
  mobile: 'А в телефоне это работает? Директор смотрит всё только в телефоне.',
  api: 'У вас есть API? Мы ничего не будем с ним делать, но он должен быть.',
  excel: 'А в Excel выгрузить можно? Иначе бухгалтерия это не признает.',
  push: 'А уведомления приходят? Мы забываем, что купили, если нам не напоминать.',
  roles: 'А права доступа настраиваются? У нас стажёр, и мы его боимся.',
  onb: 'А обучение есть? Мы открыли, посмотрели и закрыли. Нас надо вести за руку.',
  ref: 'А если я приведу соседа — мне скидка? Я без скидки никого не привожу.',
  crm: 'С нашей CRM интегрируется? Она самописная, 2009 года.',
  sso: 'Вход по корпоративной почте есть? Без него служба безопасности меня съест.',
  shield: 'У вас есть сертификат безопасности? Нам нужен PDF с печатью.',
  c1: 'С 1С работает? Без неё главный бухгалтер считает, что вас не существует.',
  audit: 'Журнал действий ведётся? Нам важно знать, кто виноват, ещё до того, как что-то случится.',
};

/** the two answers to a client on the line, with today's numbers: what honesty costs and how long a promise holds */
export function callAnswers(honestMult: number, sureMult: number, sprints: number): string[] {
  const off = Math.round((1 - honestMult) * 100);
  const up = Math.round((sureMult - 1) * 100);
  return [
    `Честно: «Пока нет, но в планах» <span>— подпишет со скидкой ${off}%</span>`,
    `Уверенно: «Конечно. Уже в проде» <span>— заплатит на ${up}% больше; не построишь за ${sprints} спринта — уйдёт и заберёт деньги</span>`,
  ];
}

/** `%s` — the sum, `%t` — how long it lasts */
export const BANK_TEXT = 'Деньги кончились. Под залог квартиры дадим <em>%s</em> — это ещё %t жизни. Не выйдете в плюс — квартира наша.';
export const BANK_ANSWERS = ['Заложить квартиру', 'Закрыть стартап достойно'];

/** The very first client is an acquaintance of the founder: it speaks like a friend and bargains like an enemy. */
export const FIRST_CLIENT_SAYS = '«Беру. Но как первому — бесплатно, да?»';

/** What a client of each type says when the first one of its kind comes. */
export const CLIENT_SAYS: Record<ClientType, string> = {
  small: '',
  mid: '«Мы сеть. Нужна скидка за объём. Объём — два филиала»',
  startup: '«Мы тоже стартап! Заплатим из следующего раунда»',
  corp: '«Выслали анкету поставщика. В ней 214 вопросов»',
  gov: '«Договор на согласовании. Подпись будет. Когда-нибудь»',
};

/** What a happy client says when it finds something to improve; `%s` — the short name of the block. */
export const REWORK_SAYS = [
  '«Доработайте «%s»: директор хочет кнопку побольше»',
  '«В «%s» нужна ещё одна галочка. Всего одна»',
  '«Сделайте «%s» как у конкурента, только лучше»',
  '«Мы тут подумали: «%s» надо переделать»',
  '«%s» отличный. Но есть нюанс»',
];

/** Claude at the start of the next startup: he does not remember the last one, the founder does. By how it ended. */
export const AGAIN_SAYS: Record<string, string> = {
  broke: 'Говорят, прошлый стартап закрылся. Я его не помню: у меня новая сессия. Помнить будешь ты.',
  late: 'Говорят, прошлый стартап так и не вышел в плюс. Я его не помню: у меня новая сессия.',
  sold: 'Говорят, ты продал компанию — и снова на кухне. Это называется «серийный предприниматель».',
  profit: 'Говорят, прошлый стартап вышел в плюс, а ты ушёл делать новый. Я не спрашиваю зачем.',
};

/** Who a client is, in two words under its name, the first time such a client comes. */
export const CLIENT_TYPE_NOTE: Record<ClientType, string> = {
  small: '',
  mid: 'сеть: платит за двоих, ждёт на спринт меньше',
  startup: 'такой же стартап: платит хорошо, может закрыться сам',
  corp: 'корпорация: платит много, просит своё',
  gov: 'госзаказчик: платит больше всех — после того, как получит свой блок',
};

/** The founder's own words on the release card, by what happened. */
export function releaseLines(r: {
  sprint: number;
  shipped: string[];
  came: number;
  left: number;
  closed: number;
  reasons: string[];
  /** subscriptions and tokens, $ per second */
  mrr: number;
  tokens: number;
  debt: number;
  down: boolean;
  /** clients who use the product for free because there is nothing to charge them with */
  unpaid?: number;
}): string[] {
  const lines = [`<b>❯ релиз · спринт ${r.sprint}</b>`];
  if (r.shipped.length > 0) lines.push(`выпущено: ${r.shipped.join(', ')}`);
  else lines.push('<span>выпущено: ничего. Зато стабильно</span>');
  if (r.came > 0 || r.left > 0) {
    const came = r.came > 0 ? `<em>+${r.came}</em> ${r.came === 1 ? 'клиент' : 'клиента'}` : 'новых клиентов нет';
    const left = r.left > 0 ? ` · <strong>−${r.left}</strong> ${r.reasons[0] ? `ушёл: нет «${r.reasons[0]}»` : 'ушёл молча'}` : '';
    lines.push(came + left);
  }
  if (r.closed > 0) lines.push(`<span>−${r.closed} клиент закрылся сам: он тоже был стартапом</span>`);
  // the same unit as everywhere on the sheet: money per second
  if (r.unpaid) lines.push(`<strong>клиенты не платят: нет «Приёма оплаты»</strong>`, `токены за них: ${rate(-r.tokens)} в секунду`);
  else if (!r.down) lines.push(`теперь: подписки <em>+${rate(r.mrr)}/с</em> · токены ${rate(-r.tokens)}/с`);
  if (r.down) lines.push('<strong>продукт лежит до следующего релиза:</strong>', '<strong>клиенты не платят</strong>');
  else if (r.debt >= 20) lines.push(`<strong>долг ${Math.round(r.debt)} — следующий релиз может всё уронить</strong>`);
  else if (r.debt >= 8) lines.push(`<span>долг ${Math.round(r.debt)} — держится на честном слове</span>`);
  return lines;
}
