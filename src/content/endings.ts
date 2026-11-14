import { money, plural } from '../ui/format';
import { pitch, type Ending, type Run } from '../systems/run/run';

/** The founder's post at the end of a startup. Every ending is a genre of its own. */

export const ENDING_TITLE: Record<Ending, string> = {
  broke: 'Банкротство',
  late: 'Время вышло',
  sold: 'Продажа',
  profit: 'Прибыль',
};

/** «12:40» */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

const CLIENT_WORD = ['клиент', 'клиента', 'клиентов'] as const;
const TIMES = ['раз', 'раза', 'раз'] as const;

export function endingPost(run: Run): string[] {
  const lines = mainPost(run);
  const s = run.stats;
  // what was said on the calls and what became of the flat: a postscript to any ending
  if (s.promises > 0) lines.push(`P.S. Клиентам я пообещал ${s.promises} ${plural(s.promises, ['функцию', 'функции', 'функций'])}, «уже в проде». Построил ${s.kept}.`);
  if (run.mortgaged) lines.push(run.over === 'broke' ? 'P.P.S. Квартиру тоже забрали. Пишу из коворкинга.' : 'P.P.S. Квартиру, кстати, выкупил.');
  return lines;
}

function mainPost(run: Run): string[] {
  const name = pitch(run.idea);
  const s = run.stats;
  // the same genre in other words: which wording a startup gets is decided by its seed, line by line
  const say = (k: number, ...options: string[]): string => options[(run.seed >>> k) % options.length];
  switch (run.over) {
    case 'sold':
      return [
        say(0, `Мы стали частью большой семьи. Тред.`, `Важный день для нашей команды из одного человека. Тред.`),
        `1/ ${name} куплен за <em>${money(s.soldFor)}</em>.`,
        say(1, `2/ Продукт закроют в пятницу. Клиентам придёт письмо со словом «синергия».`, `2/ Продукт «интегрируют в экосистему». Это значит то, что вы подумали.`),
        say(2, `3/ Благодарю команду — то есть Клода. Он не просил опционов.`, `3/ Отдельное спасибо Клоду. Он узнает об этом в новой сессии.`),
        say(3, `4/ Что дальше? Немного отдохну. Примерно до понедельника.`, `4/ Что дальше? У меня уже есть идея. Она тоже обёртка.`),
      ];
    case 'profit':
      return [
        say(0, `Как я вышел на прибыль без инвесторов. Тред.`, `Мы прибыльны. Да, так тоже можно. Тред.`),
        `1/ ${name}: ${s.clients} ${plural(s.clients, CLIENT_WORD)} за всё время, пик подписок <em>${money(s.peakMrr)}</em> за спринт.`,
        `2/ Секрет прост: ${s.shipped} ${plural(s.shipped, ['блок', 'блока', 'блоков'])}, один человек и ни одного выходного.`,
        s.downs > 0 ? `3/ Да, продукт лежал ${s.downs} ${plural(s.downs, TIMES)}. Это называлось «плановые работы».` : `3/ Продукт ни разу не лежал. Я сам не понимаю как.`,
        say(3, `4/ Курс «Повтори мой путь» — по ссылке в профиле.`, `4/ Инвесторы, которые не отвечали, теперь пишут сами. Отвечаю не сразу — из принципа.`),
      ];
    case 'late':
      return [
        say(0, `Честный апдейт. Тред.`, `Немного прозрачности. Тред.`),
        `1/ ${name} прожил ${clock(run.t)} и всё ещё в минусе.`,
        say(1, `2/ Формально мы живы. Я называю это «стадией поиска модели».`, `2/ Мы не убыточны, мы «инвестируем в рост». Из моих сбережений.`),
        `3/ Подписки: <em>${money(s.peakMrr)}</em> на пике. Токены: <strong>${money(s.tokens)}</strong> за всё время. Считайте сами.`,
        say(3, `4/ Сбережения кончатся раньше, чем этот тред наберёт просмотры.`, `4/ Если вы инвестор — мои сообщения открыты. Если клиент — тем более.`),
      ];
    default:
      return [
        say(0, `Закрываю стартап. Десять уроков. Тред.`, `Мы закрываемся. Это не провал, это опыт. Тред.`),
        say(1, `1/ ${name} прожил ${clock(run.t)}. Это был невероятный путь.`, `1/ ${name}: ${clock(run.t)} от идеи до этого поста. Благодарен за каждую секунду, особенно за последние.`),
        s.clients === 0
          ? `2/ Клиентов у нас не было. Зато интерес был огромный.`
          : s.left * 2 >= s.clients
            ? `2/ Клиенты уходили быстрее, чем я успевал спросить почему. Ушло ${s.left} из ${s.clients}.`
            : `2/ У нас было ${s.clients} ${plural(s.clients, CLIENT_WORD)}. Токены оказались дороже, чем я думал. Думал я мало.`,
        s.downs > 0 ? `3/ Продукт лежал ${s.downs} ${plural(s.downs, TIMES)}. В статусе было написано «улучшаем».` : `3/ Рынок оказался не готов. Рынок вообще редко готов.`,
        say(3, `4/ Остальные семь уроков — в платной рассылке.`, `4/ Открыт к предложениям. Резюме обновил ещё на третьем спринте.`),
      ];
  }
}

export function endingStats(run: Run): string {
  const s = run.stats;
  return `прожил ${clock(run.t)} · клиентов ${s.clients}, ушло ${s.left} · пик подписок ${money(s.peakMrr)} · блоков ${s.shipped} · падений ${s.downs}`;
}
