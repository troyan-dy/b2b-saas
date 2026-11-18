import { L, LANG } from '../core/lang';

/** how numbers are written: «12 400» and «1,5» in Russian, «12,400» and «1.5» in English */
const LOCALE = L('ru-RU', 'en-US');
const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** «в секунду», short: «$7,4/с» */
export const PER_S = L('/с', '/s');

/** a small number with its fraction as the language writes it: 1.5 → «1,5» in Russian */
export function dec(n: number): string {
  return LANG === 'en' ? String(n) : String(n).replace('.', ',');
}

export function signed(value: number): string {
  return (value > 0 ? '+' : value < 0 ? '−' : '') + whole(Math.abs(value));
}

export function primary(value: string): string {
  return value.replace(/^(?:v\d+:|Сразу:|Immediately:)\s*/, '').split(' · ')[0];
}

export function multiplier(value: number): string {
  return '×' + dec(Number(value.toFixed(2)));
}

/** 950 → «$950», 12400 → «$12 400», -300 → «−$300»: ink with a minus, the palette has no red */
export function money(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}$${int.format(Math.abs(v))}`;
}

/** Money per second: «$7,4» below twenty, «$155» above — small sums keep their tenths. */
export function rate(n: number): string {
  const a = Math.abs(n);
  const body = a < 20 ? dec(Math.round(a * 10) / 10) : int.format(Math.round(a));
  return `${n < 0 ? '−' : ''}$${body}`;
}

/** 12400 → «12 400» */
export function whole(n: number): string {
  return int.format(Math.round(n));
}

/**
 * Plural by number: plural(3, ['спринт', 'спринта', 'спринтов']) → «спринта».
 * English takes the first form for one and the last for the rest.
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const k = Math.abs(Math.round(n));
  if (LANG === 'en') return k === 1 ? forms[0] : forms[2];
  if (k % 10 === 1 && k % 100 !== 11) return forms[0];
  if (k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14)) return forms[1];
  return forms[2];
}
