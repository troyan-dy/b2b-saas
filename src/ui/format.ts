const LOCALE = 'ru-RU';
const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** 950 → «$950», 12400 → «$12 400», -300 → «−$300»: ink with a minus, the palette has no red */
export function money(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}$${int.format(Math.abs(v))}`;
}

/** Money per second: «$7,4» below twenty, «$155» above — small sums keep their tenths. */
export function rate(n: number): string {
  const a = Math.abs(n);
  const body = a < 20 ? String(Math.round(a * 10) / 10).replace('.', ',') : int.format(Math.round(a));
  return `${n < 0 ? '−' : ''}$${body}`;
}

/** 12400 → «12 400» */
export function whole(n: number): string {
  return int.format(Math.round(n));
}

/** Plural by number: plural(3, ['спринт', 'спринта', 'спринтов']) → «спринта» */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const k = Math.abs(Math.round(n));
  if (k % 10 === 1 && k % 100 !== 11) return forms[0];
  if (k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14)) return forms[1];
  return forms[2];
}
