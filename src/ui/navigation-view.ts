/** Number shortcuts are one-based. Return -1 for keys outside the current list. */
export function shortcutIndex(code: string, length: number): number {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return digit && Number(digit[1]) <= length ? Number(digit[1]) - 1 : -1;
}

/** Arrow navigation wraps; a list without an initial selection starts at the near end. */
export function adjacentIndex(current: number, length: number, direction: -1 | 1): number {
  if (!length) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
}

export function tabIndexForKey(code: string, current: number, length: number): number {
  if (!length) return -1;
  switch (code) {
    case 'ArrowLeft':
      return adjacentIndex(current, length, -1);
    case 'ArrowRight':
      return adjacentIndex(current, length, 1);
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return -1;
  }
}
