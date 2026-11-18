// This temporary PR verifies that an untested module blocks merging into master.
export function uncoveredIncrement(value: number): number {
  return value + 1;
}
