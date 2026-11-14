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
  switch (run.over) {
    case 'sold':
      return [
        `Мы стали частью большой семьи. Тред.`,
        `1/ ${name} куплен за <em>${money(s.soldFor)}</em>.`,
        `2/ Продукт закроют в пятницу. Клиентам придёт письмо со словом «синергия».`,
        `3/ Благодарю команду — то есть Клода. Он не просил опционов.`,
        `4/ Что дальше? Немного отдохну. Примерно до понедельника.`,
      ];
    case 'profit':
      return [
        `Как я вышел на прибыль без инвесторов. Тред.`,
        `1/ ${name}: ${s.clients} ${plural(s.clients, CLIENT_WORD)} за всё время, пик подписок <em>${money(s.peakMrr)}</em> за спринт.`,
        `2/ Секрет прост: ${s.shipped} ${plural(s.shipped, ['блок', 'блока', 'блоков'])}, один человек и ни одного выходного.`,
        s.downs > 0 ? `3/ Да, продукт лежал ${s.downs} ${plural(s.downs, TIMES)}. Это называлось «плановые работы».` : `3/ Продукт ни разу не лежал. Я сам не понимаю как.`,
        `4/ Курс «Повтори мой путь» — по ссылке в профиле.`,
      ];
    case 'late':
      return [
        `Честный апдейт. Тред.`,
        `1/ ${name} прожил ${clock(run.t)} и всё ещё в минусе.`,
        `2/ Формально мы живы. Я называю это «стадией поиска модели».`,
        `3/ Подписки: <em>${money(s.peakMrr)}</em> на пике. Токены: <strong>${money(s.tokens)}</strong> за всё время. Считайте сами.`,
        `4/ Сбережения кончатся раньше, чем этот тред наберёт просмотры.`,
      ];
    default:
      return [
        `Закрываю стартап. Десять уроков. Тред.`,
        `1/ ${name} прожил ${clock(run.t)}. Это был невероятный путь.`,
        s.clients === 0
          ? `2/ Клиентов у нас не было. Зато интерес был огромный.`
          : s.left * 2 >= s.clients
            ? `2/ Клиенты уходили быстрее, чем я успевал спросить почему. Ушло ${s.left} из ${s.clients}.`
            : `2/ У нас было ${s.clients} ${plural(s.clients, CLIENT_WORD)}. Токены оказались дороже, чем я думал. Думал я мало.`,
        s.downs > 0 ? `3/ Продукт лежал ${s.downs} ${plural(s.downs, TIMES)}. В статусе было написано «улучшаем».` : `3/ Рынок оказался не готов. Рынок вообще редко готов.`,
        `4/ Остальные семь уроков — в платной рассылке.`,
      ];
  }
}

export function endingStats(run: Run): string {
  const s = run.stats;
  return `прожил ${clock(run.t)} · клиентов ${s.clients}, ушло ${s.left} · пик подписок ${money(s.peakMrr)} · блоков ${s.shipped} · падений ${s.downs}`;
}
