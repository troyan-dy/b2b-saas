import { L } from '../core/lang';
import effects from '../data/balance/effects.json';
import headlinesEn from '../data/balance/headlines.en.json';
import headlines from '../data/balance/headlines.json';
import type { ClientType, Lane, Tier } from '../systems/run/run';
import { dec, PER_S, plural, rate } from '../ui/format';

const EFFECT_NAME: Record<string, string> = L(
  {
    word_of_mouth: 'сарафан',
    corp_pay: 'чек крупных',
    small_pay: 'чек малого бизнеса',
    promo: 'продвижение',
    tokens: 'токены',
  },
  {
    word_of_mouth: 'word of mouth',
    corp_pay: 'enterprise bill',
    small_pay: 'small-business bill',
    promo: 'promotion',
    tokens: 'tokens',
  },
);

const SEATS = L<[string, string, string]>(['место', 'места', 'мест'], ['seat', 'seats', 'seats']);

function effectWords(k: string, v: number): string {
  if (k === 'seats') return L(`+${v} ${plural(v, SEATS)} для клиентов`, `+${v} client ${plural(v, SEATS)}`);
  if (k === 'patience') return L(`клиенты терпеливее на ${v} спр.`, `clients wait ${v} spr. longer`);
  if (k === 'small_pay' || k === 'corp_pay') return `${EFFECT_NAME[k]} +${Math.round((v - 1) * 100)}% ${L('базы', 'base')}`;
  return `${EFFECT_NAME[k] ?? k} ×${dec(v)}`;
}

/** Everything a block gives, each thing in two words — for a small tile of the shelf; the main one first. */
export function benefits(kind: string): string[] {
  const e = (effects as Record<string, Record<string, number>>)[kind];
  if (!e) return [];
  const x = (v: number): string => `×${dec(v)}`;
  return Object.entries(e).map(([k, v]) => {
    switch (k) {
      case 'seats':
        return `+${v} ${plural(v, SEATS)}`;
      case 'patience':
        return L(`терпение +${v}`, `patience +${v}`);
      case 'small_pay':
        return L(`чек малых +${Math.round((v - 1) * 100)}%`, `small bill +${Math.round((v - 1) * 100)}%`);
      case 'corp_pay':
        return L(`чек крупных +${Math.round((v - 1) * 100)}%`, `big bill +${Math.round((v - 1) * 100)}%`);
      case 'promo':
        return L(`промо ${x(v)}`, `promo ${x(v)}`);
      case 'word_of_mouth':
        return L(`сарафан ${x(v)}`, `word of mouth ${x(v)}`);
      case 'tokens':
        return L(`токены ${x(v)}`, `tokens ${x(v)}`);
      default:
        return `${k} ${x(v)}`;
    }
  });
}
/** The main thing a block gives, in two or three words: the shelf writes it next to the name. */
export function benefit(kind: string): string {
  const e = (effects as Record<string, Record<string, number>>)[kind];
  if (!e) return '';
  const [k, v] = Object.entries(e)[0];
  return k === 'seats' ? `+${v} ${plural(v, SEATS)}` : k === 'small_pay' || k === 'corp_pay' ? L(`чек +${Math.round((v - 1) * 100)}%`, `bill +${Math.round((v - 1) * 100)}%`) : effectWords(k, v);
}

/** What a shipped block gives, in the words of the shelf: «продвижение ×1,5». Empty for a block that only stands there. */
export function effectLine(kind: string, rest = false): string {
  const e = (effects as Record<string, Record<string, number>>)[kind];
  if (!e) return '';
  // `rest` — without the first effect: the shelf has already written it next to the name
  return Object.entries(e)
    .slice(rest ? 1 : 0)
    .map(([k, v]) => effectWords(k, v))
    .join(' · ');
}

/** The words of the sheet. Dry on purpose: the joke is in what is said, never in how. */

export const LANE_NAME: Record<Lane, string> = L(
  { build: 'стройка', fix: 'починка', promo: 'продвижение' },
  { build: 'build', fix: 'fixes', promo: 'promotion' },
);

/** «проверяешь стройку» */
export const LANE_ACC: Record<Lane, string> = L(
  { build: 'стройку', fix: 'починку', promo: 'продвижение' },
  { build: 'the build', fix: 'the fixes', promo: 'promotion' },
);

/** What the founder does with his own hands on each lane: a founder codes least of all. */
export const HAND_NAME: Record<Lane, string> = L(
  { build: 'кодить', fix: 'чинить', promo: 'пост' },
  { build: 'code', fix: 'fix', promo: 'post' },
);

/** said over the desk when there is nothing for the hands to do there */
export const HAND_IDLE: Record<Lane, string> = L(
  {
    build: 'строить нечего: выбери блок',
    fix: 'долга нет: чинить нечего',
    promo: 'показывать нечего: нужны ядро и лендинг',
  },
  {
    build: 'nothing to build: pick a block',
    fix: 'no debt: nothing to fix',
    promo: 'nothing to show: needs the core and a landing page',
  },
);

/** said where the square lands */
export const HAND_DONE: Record<Lane, string> = L(
  { build: '', fix: 'починил сам', promo: 'пост написан' },
  { build: '', fix: 'fixed it yourself', promo: 'post written' },
);

export const TIER_NAME: Record<Tier, string> = L({ fast: 'базовый', normal: 'опытный', think: 'эксперт' }, { fast: 'basic', normal: 'experienced', think: 'expert' });

export const TIER_TITLE: Record<Tier, string> = L(
  { fast: 'Базовый агент', normal: 'Опытный агент', think: 'Агент-эксперт' },
  { fast: 'Basic agent', normal: 'Experienced agent', think: 'Expert agent' },
);

export const TIER_NOTE: Record<Tier, string> = L(
  { fast: 'дешёвая работа · долг копится быстро', normal: 'в 1,8 раза быстрее · в 4 раза меньше долга', think: 'в 3,2 раза быстрее базового · без нового долга' },
  { fast: 'cheap work · debt builds up quickly', normal: '1.8× faster · 4× less debt', think: '3.2× as fast as basic · no new debt' },
);

export const STAGE_NAME = L(['', 'кухня', 'первые клиенты', 'город клиентов'], ['', 'the kitchen', 'first clients', 'a city of clients']);

/** What a client says when it leaves without the block it waited for; `%s` — the short name of the block. */
export const LEFT_KNOWN = L(
  ['«без %s нам не подходит»', '«мы просили %s ещё в прошлом спринте»', '«у конкурентов %s уже есть»'],
  ['“without %s it’s not for us”', '“we asked for %s back in the last sprint”', '“the competitors already have %s”'],
);
export const LEFT_GENERIC = L(
  ['«мы пересмотрели приоритеты»', '«дело не в вас, дело в бюджете»'],
  ['“we have revised our priorities”', '“it’s not you, it’s the budget”'],
);

/** The news line: the industry talks to itself. Shown in turn, between the events of the run. The English lines are in the same order. */
export const NEWS: readonly string[] = L(headlines, headlinesEn);

/** What is said when a client that is a startup itself closes; `%s` is not used: the name is on the sheet. */
export const LEFT_CLOSED = L(
  ['закрылся: деньги кончились раньше, чем у тебя', 'закрылся: «это был невероятный путь»', 'закрылся: основатель ушёл в найм'],
  ['shut down: ran out of money before you did', 'shut down: “it’s been an incredible journey”', 'shut down: the founder took a job'],
);

/** Said once, when something happens for the first time. */
export const NEWS_EVENT = L(
  {
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
    /** `%s` — the block the market suddenly wants */
    trend: 'Тренд сезона: всем вдруг понадобился «%s». Вчера без него как-то жили',
    hero: 'Основатель дописал обещанное за минуту до релиза. Клиент решил, что так и было задумано',
    haggleFail: 'Покупатель бросил трубку. Перезвонит через четыре спринта — если не найдёт обёртку подешевле',
  },
  {
    firstBlock: 'A Claude wrapper went live in somebody’s kitchen. The world hasn’t noticed yet',
    firstClient: 'The startup has its first client. It’s a friend of the founder, but the pitch deck will say “early adopter”',
    firstPay: 'The first payment. The founder took a screenshot and is already writing a post',
    firstLeft: 'The startup lost a client and learned the word “churn”',
    down: 'The product is down. The status page says “we are working on improvements”',
    stage3: 'Companies with a procurement department got interested in the startup. This will take a while',
    profit: 'The startup is in the black. The founder is urgently looking for something else to build',
    link: 'Two blocks ended up side by side and started calling themselves a “platform”',
    demoOk: 'Demo day: “%s” was shown, and it didn’t crash. Three came for a closer look: +3 leads',
    demoFail: 'Demo day: there was nothing to show. %s left the call “for a minute” and never came back',
    trend: 'Trend of the season: suddenly everyone needs “%s”. Yesterday they somehow lived without it',
    hero: 'The founder finished what was promised a minute before the release. The client decided it was planned that way',
    haggleFail: 'The buyer hung up. They’ll call back in four sprints — unless they find a cheaper wrapper',
  },
);

export const LEFT_DEMO = L(['ушёл с демо-дня: смотреть было не на что'], ['left on demo day: there was nothing to look at']);

/** What a client asks on a call, by the block it needs. The question is always about something that is not there. */
export const CALL_ASK: Record<string, string> = L(
  {
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
  },
  {
    bot: 'Is your support available 24/7? Or is it “just email us” again?',
    dash: 'Is there a dashboard? I need something to show at the Monday meeting.',
    dark: 'Do you have a dark mode? Our developers refuse to open it without one.',
    mobile: 'Does it work on a phone? Our CEO looks at everything on a phone only.',
    api: 'Do you have an API? We won’t do anything with it, but it has to exist.',
    excel: 'Can it export to Excel? Otherwise accounting won’t recognize it.',
    push: 'Do notifications come? We forget what we bought unless we are reminded.',
    roles: 'Can access rights be configured? We have an intern, and we fear the intern.',
    onb: 'Is there onboarding? We opened it, looked and closed it. We need to be led by the hand.',
    ref: 'If I bring my neighbour — do I get a discount? I bring nobody without a discount.',
    crm: 'Does it integrate with our CRM? It’s home-made, from 2009.',
    sso: 'Is there single sign-on? Without it our security team will eat me alive.',
    shield: 'Do you have a security certificate? We need a PDF with a stamp.',
    c1: 'Does it work with SAP? Without it our chief accountant believes you don’t exist.',
    audit: 'Is there an audit log? We need to know who is to blame before anything even happens.',
  },
);

/** the two answers to a client on the line, with today's numbers: what honesty costs and how long a promise holds */
export function callAnswers(honestMult: number, sureMult: number, sprints: number): string[] {
  const off = Math.round((1 - honestMult) * 100);
  const up = Math.round((sureMult - 1) * 100);
  return L(
    [
      `Честно: «Пока нет, но в планах» <span>— подпишет со скидкой ${off}%</span>`,
      `Уверенно: «Конечно. Уже в проде» <span>— заплатит на ${up}% больше; не построишь за ${sprints} спринта — уйдёт и заберёт деньги</span>`,
    ],
    [
      `Honestly: “Not yet, but it’s planned” <span>— signs with a ${off}% discount</span>`,
      `Confidently: “Of course. Already in prod” <span>— pays ${up}% more; not built in ${sprints} sprints — leaves and takes the money back</span>`,
    ],
  );
}

/** `%s` — the sum, `%t` — how long it lasts */
export const BANK_TEXT = L(
  'Деньги кончились. Под залог квартиры дадим <em>%s</em> — это ещё %t секунд жизни. Не выйдете в плюс — квартира наша.',
  'The money has run out. Against your flat we will lend <em>%s</em> — that is %t more seconds of life. No profit — the flat is ours.',
);
export const BANK_ANSWERS = L(['Заложить квартиру', 'Закрыть стартап достойно'], ['Mortgage the flat', 'Shut the startup down with dignity']);

/** The very first client is an acquaintance of the founder: it speaks like a friend and bargains like an enemy. */
export const FIRST_CLIENT_SAYS = L('«Беру. Но как первому — бесплатно, да?»', '“I’ll take it. But the first client gets it free, right?”');

/** What a client of each type says when the first one of its kind comes. */
export const CLIENT_SAYS: Record<ClientType, string> = L(
  {
    small: '',
    mid: '«Мы сеть. Нужна скидка за объём. Объём — два филиала»',
    startup: '«Мы тоже стартап! Заплатим из следующего раунда»',
    corp: '«Выслали анкету поставщика. В ней 214 вопросов»',
    gov: '«Договор на согласовании. Подпись будет. Когда-нибудь»',
  },
  {
    small: '',
    mid: '“We’re a chain. We need a volume discount. The volume is two branches”',
    startup: '“We’re a startup too! We’ll pay out of the next round”',
    corp: '“We’ve sent you a vendor questionnaire. It has 214 questions”',
    gov: '“The contract is under review. It will be signed. Someday”',
  },
);

/** What a happy client says when it finds something to improve; `%s` — the short name of the block. */
export const REWORK_SAYS = L(
  [
    '«Доработайте «%s»: директор хочет кнопку побольше»',
    '«В «%s» нужна ещё одна галочка. Всего одна»',
    '«Сделайте «%s» как у конкурента, только лучше»',
    '«Мы тут подумали: «%s» надо переделать»',
    '«%s» отличный. Но есть нюанс»',
  ],
  [
    '“Upgrade ‘%s’: the director wants a bigger button”',
    '“‘%s’ needs one more checkbox. Just one”',
    '“Make ‘%s’ like the competitor’s, only better”',
    '“We’ve been thinking: ‘%s’ has to be redone”',
    '“‘%s’ is great. But there’s a catch”',
  ],
);

/** Claude at the start of the next startup: he does not remember the last one, the founder does. By how it ended. */
export const AGAIN_SAYS: Record<string, string> = L(
  {
    broke: 'Говорят, прошлый стартап закрылся. Я его не помню: у меня новая сессия. Помнить будешь ты.',
    late: 'Говорят, прошлый стартап так и не вышел в плюс. Я его не помню: у меня новая сессия.',
    sold: 'Говорят, ты продал компанию — и снова на кухне. Это называется «серийный предприниматель».',
    profit: 'Говорят, прошлый стартап вышел в плюс, а ты ушёл делать новый. Я не спрашиваю зачем.',
  },
  {
    broke: 'They say the last startup shut down. I don’t remember it: I have a new session. You will be the one to remember.',
    late: 'They say the last startup never turned a profit. I don’t remember it: I have a new session.',
    sold: 'They say you sold the company — and you’re back in the kitchen. That’s called a “serial entrepreneur”.',
    profit: 'They say the last startup was profitable, and you left to start a new one. I’m not asking why.',
  },
);

/** Who a client is, in two words under its name, the first time such a client comes. */
export const CLIENT_TYPE_NOTE: Record<ClientType, string> = L(
  {
    small: '',
    mid: 'сеть: платит за двоих, ждёт на спринт меньше',
    startup: 'такой же стартап: платит хорошо, может закрыться сам',
    corp: 'корпорация: платит много, просит своё',
    gov: 'госзаказчик: платит больше всех — после того, как получит свой блок',
  },
  {
    small: '',
    mid: 'a chain: pays for two, waits a sprint less',
    startup: 'a startup like yours: pays well, may shut down by itself',
    corp: 'a corporation: pays a lot, asks for things of its own',
    gov: 'a government client: pays the most — after it gets its block',
  },
);

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
  const lines = [L(`<b>❯ релиз · спринт ${r.sprint}</b>`, `<b>❯ release · sprint ${r.sprint}</b>`)];
  if (r.shipped.length > 0) lines.push(L(`выпущено: ${r.shipped.join(', ')}`, `shipped: ${r.shipped.join(', ')}`));
  else lines.push(L('<span>выпущено: ничего. Зато стабильно</span>', '<span>shipped: nothing. But it’s stable</span>'));
  if (r.came > 0 || r.left > 0) {
    const came =
      r.came > 0 ? L(`<em>+${r.came}</em> ${r.came === 1 ? 'клиент' : 'клиента'}`, `<em>+${r.came}</em> ${r.came === 1 ? 'client' : 'clients'}`) : L('новых клиентов нет', 'no new clients');
    const why = r.reasons[0] ? L(`ушёл: нет «${r.reasons[0]}»`, `left: no “${r.reasons[0]}”`) : L('ушёл молча', 'left silently');
    const left = r.left > 0 ? ` · <strong>−${r.left}</strong> ${why}` : '';
    lines.push(came + left);
  }
  if (r.closed > 0) lines.push(L(`<span>−${r.closed} клиент закрылся сам: он тоже был стартапом</span>`, `<span>−${r.closed} client shut down by itself: it was a startup too</span>`));
  // the same unit as everywhere on the sheet: money per second
  if (r.unpaid) {
    lines.push(
      L('<strong>клиенты не платят: нет «Приёма оплаты»</strong>', '<strong>clients don’t pay: no “Payments”</strong>'),
      L(`токены за них: ${rate(-r.tokens)} в секунду`, `their tokens: ${rate(-r.tokens)} per second`),
    );
  } else if (!r.down) {
    lines.push(L(`теперь: подписки <em>+${rate(r.mrr)}${PER_S}</em> · токены ${rate(-r.tokens)}${PER_S}`, `subscriptions <em>+${rate(r.mrr)}${PER_S}</em> · tokens ${rate(-r.tokens)}${PER_S}`));
  }
  if (r.down) {
    lines.push(L('<strong>продукт лежит до следующего релиза:</strong>', '<strong>the product is down until the next release:</strong>'), L('<strong>клиенты не платят</strong>', '<strong>clients don’t pay</strong>'));
  } else if (r.debt >= 20) {
    lines.push(L(`<strong>долг ${Math.round(r.debt)} — следующий релиз может всё уронить</strong>`, `<strong>debt ${Math.round(r.debt)} — the next release may bring it all down</strong>`));
  } else if (r.debt >= 8) {
    lines.push(L(`<span>долг ${Math.round(r.debt)} — держится на честном слове</span>`, `<span>debt ${Math.round(r.debt)} — holding on by a thread</span>`));
  }
  return lines;
}
