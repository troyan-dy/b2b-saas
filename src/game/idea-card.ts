import { L } from '../core/lang';
import { traitGives, type Trait } from '../systems/meta/meta';
import type { Card } from '../ui/terminal/terminal';

/** what a card does, one fact a line: «чек ×1,5, но и токенов уходит ×1,5» → two lines */
export function facts(does: string): string[] {
  return does === '' ? [] : does.split(', ').map((x) => x.replace(L(/^но и /, /^but /), ''));
}

export function traitCard(t: Trait, level: number, kicker: string, to: number): Card {
  const now = level > 0 ? L(`сейчас: ${traitGives(t, level)}`, `now: ${traitGives(t, level)}`) : L('сейчас этой черты нет', 'you don’t have this trait yet');
  return { kicker, title: t.title, note: t.note, art: t.art, facts: [`${traitGives(t, to)}`, now] };
}
