import { L } from '../core/lang';
import { money, PER_S, plural, rate } from '../ui/format';
import { pitch, TUNING, type Ending } from '../systems/run/run';

import type { FinalRun } from '../systems/meta/meta';

/** The founder's post at the end of a startup. Every ending is a genre of its own. */

export const ENDING_TITLE: Record<Ending, string> = L(
  { broke: 'Банкротство', late: 'Время вышло', sold: 'Продажа', profit: 'Прибыль' },
  { broke: 'Bankruptcy', late: 'Out of time', sold: 'Exit', profit: 'Profit' },
);

/** «12:40» */
export function clock(seconds: number): string {
  const whole = Math.floor(seconds + 1e-6);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

type Forms = [string, string, string];
const CLIENT_WORD = L<Forms>(['клиент', 'клиента', 'клиентов'], ['client', 'clients', 'clients']);
const TIMES = L<Forms>(['раз', 'раза', 'раз'], ['time', 'times', 'times']);
const FEATURES = L<Forms>(['функцию', 'функции', 'функций'], ['feature', 'features', 'features']);
const BLOCK_WORD = L<Forms>(['блок', 'блока', 'блоков'], ['block', 'blocks', 'blocks']);

export function endingPost(run: FinalRun): string[] {
  const lines = mainPost(run);
  const s = run.stats;
  // what was said on the calls and what became of the flat: a postscript to any ending
  if (s.promises > 0) {
    lines.push(
      L(
        `P.S. Клиентам я пообещал ${s.promises} ${plural(s.promises, FEATURES)}, «уже в проде». Построил ${s.kept}.`,
        `P.S. I promised clients ${s.promises} ${plural(s.promises, FEATURES)}, “already in prod”. Built ${s.kept}.`,
      ),
    );
  }
  if (s.offered > 0) {
    lines.push(
      L(
        `P.S. Клод ${s.offered} ${plural(s.offered, TIMES)} предлагал срезать угол. Я согласился ${s.shortcuts}.`,
        `P.S. Claude offered to cut a corner ${s.offered} ${plural(s.offered, TIMES)}. I agreed to ${s.shortcuts}.`,
      ),
    );
  }
  if (run.mortgaged) {
    lines.push(
      run.over === 'broke'
        ? L('P.P.S. Квартиру тоже забрали. Пишу из коворкинга.', 'P.P.S. They took the flat too. Writing this from a coworking space.')
        : L('P.P.S. Квартиру, кстати, выкупил.', 'P.P.S. Bought the flat back, by the way.'),
    );
  }
  return lines;
}

function mainPost(run: FinalRun): string[] {
  const name = pitch(run.idea);
  const s = run.stats;
  // the same genre in other words: which wording a startup gets is decided by its seed, line by line
  const say = (k: number, ...options: string[]): string => options[(run.seed >>> k) % options.length];
  const peak = rate(s.peakMrr / TUNING.sprint_s);
  const downs = `${s.downs} ${plural(s.downs, TIMES)}`;
  switch (run.over) {
    case 'sold':
      if (run.downWhy === 'supplier') return L([
        `1/ ${name} встретил финал без поставщика. Подписки временно остановились.`,
        '2/ Два предыдущих релиза принесли прибыль. После восстановления подписки снова покроют расходы.',
      ], [
        `1/ ${name} reached the finish during a supplier outage. Subscription revenue paused.`,
        '2/ The two previous releases were profitable. Subscriptions will cover costs again when service resumes.',
      ]);
      return L(
        [
          say(0, `Мы стали частью большой семьи. Тред.`, `Важный день для нашей команды из одного человека. Тред.`),
          `1/ ${name} куплен за <em>${money(s.soldFor)}</em>.`,
          say(1, `2/ Продукт закроют в пятницу. Клиентам придёт письмо со словом «синергия».`, `2/ Продукт «интегрируют в экосистему». Это значит то, что вы подумали.`),
          say(2, `3/ Благодарю команду — то есть Клода. Он не просил опционов.`, `3/ Отдельное спасибо Клоду. Он узнает об этом в новой сессии.`),
          say(3, `4/ Что дальше? Немного отдохну. Примерно до понедельника.`, `4/ Что дальше? У меня уже есть идея. Она тоже обёртка.`),
        ],
        [
          say(0, `We have become part of a big family. Thread.`, `A big day for our team of one. Thread.`),
          `1/ ${name} has been acquired for <em>${money(s.soldFor)}</em>.`,
          say(1, `2/ The product shuts down on Friday. Clients will get an email with the word “synergy” in it.`, `2/ The product will be “integrated into the ecosystem”. It means what you think it means.`),
          say(2, `3/ I thank the team — that is, Claude. Claude never asked for stock options.`, `3/ Special thanks to Claude, who will find out about this in a new session.`),
          say(3, `4/ What’s next? I’ll rest a little. Until about Monday.`, `4/ What’s next? I already have an idea. It’s a wrapper too.`),
        ],
      );
    case 'profit':
      return L(
        [
          say(0, `Как я вышел на прибыль без инвесторов. Тред.`, `Мы прибыльны. Да, так тоже можно. Тред.`),
          `1/ ${name}: ${s.clients} ${plural(s.clients, CLIENT_WORD)} за всё время, пик подписок <em>${peak}</em> в секунду.`,
          `2/ Секрет прост: ${s.shipped} ${plural(s.shipped, BLOCK_WORD)}, один человек и ни одного выходного.`,
          s.downs > 0 ? `3/ Да, продукт лежал ${downs}. Это называлось «плановые работы».` : `3/ Продукт ни разу не лежал. Я сам не понимаю как.`,
          say(3, `4/ Курс «Повтори мой путь» — по ссылке в профиле.`, `4/ Инвесторы, которые не отвечали, теперь пишут сами. Отвечаю не сразу — из принципа.`),
        ],
        [
          say(0, `How I got to profit without investors. Thread.`, `We are profitable. Yes, that is allowed too. Thread.`),
          `1/ ${name}: ${s.clients} ${plural(s.clients, CLIENT_WORD)} all-time, peak subscriptions <em>${peak}</em> per second.`,
          `2/ The secret is simple: ${s.shipped} ${plural(s.shipped, BLOCK_WORD)}, one person and not a single day off.`,
          s.downs > 0 ? `3/ Yes, the product was down ${downs}. It was called “scheduled maintenance”.` : `3/ The product never went down. I don’t understand how either.`,
          say(3, `4/ My course “Repeat My Journey” — link in bio.`, `4/ The investors who never replied are now writing to me. I take my time answering — on principle.`),
        ],
      );
    case 'late':
      return L(
        [
          say(0, `Честный апдейт. Тред.`, `Немного прозрачности. Тред.`),
          `1/ ${name} прожил ${clock(run.t)} и всё ещё в минусе.`,
          say(1, `2/ Формально мы живы. Я называю это «стадией поиска модели».`, `2/ Мы не убыточны, мы «инвестируем в рост». Из моих сбережений.`),
          `3/ Подписки: <em>${peak}</em> в секунду на пике. Токены: <strong>${money(s.tokens)}</strong> за всё время. Считайте сами.`,
          say(3, `4/ Сбережения кончатся раньше, чем этот тред наберёт просмотры.`, `4/ Если вы инвестор — мои сообщения открыты. Если клиент — тем более.`),
        ],
        [
          say(0, `An honest update. Thread.`, `A bit of transparency. Thread.`),
          `1/ ${name} has lived for ${clock(run.t)} and is still in the red.`,
          say(1, `2/ Technically we are alive. I call it “the business-model search stage”.`, `2/ We are not losing money, we are “investing in growth”. Out of my savings.`),
          `3/ Subscriptions: <em>${peak}</em> per second at the peak. Tokens: <strong>${money(s.tokens)}</strong> all-time. Do the math.`,
          say(3, `4/ The savings will run out before this thread gets any views.`, `4/ If you are an investor — my DMs are open. If you are a client — even more so.`),
        ],
      );
    default:
      return L(
        [
          say(0, `Закрываю стартап. Десять уроков. Тред.`, `Мы закрываемся. Это не провал, это опыт. Тред.`),
          say(1, `1/ ${name} прожил ${clock(run.t)}. Это был невероятный путь.`, `1/ ${name}: ${clock(run.t)} от идеи до этого поста. Благодарен за каждую секунду, особенно за последние.`),
          s.clients === 0
            ? `2/ Клиентов у нас не было. Зато интерес был огромный.`
            : s.left * 2 >= s.clients
              ? `2/ Клиенты уходили быстрее, чем я успевал спросить почему. Ушло ${s.left} из ${s.clients}.`
              : `2/ У нас было ${s.clients} ${plural(s.clients, CLIENT_WORD)}. Токены оказались дороже, чем я думал. Думал я мало.`,
          s.downs > 0 ? `3/ Продукт лежал ${downs}. В статусе было написано «улучшаем».` : `3/ Рынок оказался не готов. Рынок вообще редко готов.`,
          say(3, `4/ Остальные семь уроков — в платной рассылке.`, `4/ Открыт к предложениям. Резюме обновил ещё на третьем спринте.`),
        ],
        [
          say(0, `Shutting down my startup. Ten lessons. Thread.`, `We are shutting down. It’s not a failure, it’s experience. Thread.`),
          say(1, `1/ ${name} lived for ${clock(run.t)}. It’s been an incredible journey.`, `1/ ${name}: ${clock(run.t)} from the idea to this post. Grateful for every second, especially the last ones.`),
          s.clients === 0
            ? `2/ We had no clients. But the interest was enormous.`
            : s.left * 2 >= s.clients
              ? `2/ Clients were leaving faster than I could ask why. ${s.left} out of ${s.clients} left.`
              : `2/ We had ${s.clients} ${plural(s.clients, CLIENT_WORD)}. Tokens turned out more expensive than I thought. I didn’t think much.`,
          s.downs > 0 ? `3/ The product was down ${downs}. The status page said “improving”.` : `3/ The market wasn’t ready. The market rarely is.`,
          say(3, `4/ The other seven lessons are in my paid newsletter.`, `4/ Open to offers. I updated my résumé back in sprint three.`),
        ],
      );
  }
}

/** The result of a startup in one big number and the words under it. */
export function endingScore(run: FinalRun): [string, string] {
  const s = run.stats;
  switch (run.over) {
    case 'sold':
      return [`<em>${money(s.soldFor)}</em>`, L('за столько компания продана', 'what the company was sold for')];
    case 'profit':
      return [`<em>${money(s.value)}</em>`, L('оценка компании на финише — побей её в следующем стартапе', 'the company’s valuation at the finish — beat it in the next startup')];
    case 'late':
      return [money(s.value), s.profitAt > 0 ? L('оценка на финише · раньше компания выходила в плюс', 'final valuation · previously operated at a profit') : L('оценка на финише · прибыльных релизов не было', 'final valuation · no profitable releases')];
    default:
      return [clock(run.t), L('столько прожил стартап', 'how long the startup lived')];
  }
}
export function endingStats(run: FinalRun): string {
  const s = run.stats;
  const peak = `${rate(s.peakMrr / TUNING.sprint_s)}${PER_S}`;
  return L(
    `прожил ${clock(run.t)} · клиентов ${s.clients}, ушло ${s.left} · пик подписок ${peak} · блоков ${s.shipped} · доработок ${s.reworks} · падений ${s.downs}`,
    `lived ${clock(run.t)} · clients ${s.clients}, left ${s.left} · peak subscriptions ${peak} · blocks ${s.shipped} · upgrades ${s.reworks} · outages ${s.downs}`,
  );
}
