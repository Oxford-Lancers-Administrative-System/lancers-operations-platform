/** Group projected values in encounter order, without changing the input. */
export function groupValuesBy<T, K, V>(
  rows: readonly T[],
  keyOf: (row: T) => K,
  valueOf: (row: T) => V,
): Map<K, V[]> {
  const groups = new Map<K, V[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(valueOf(row));
    else groups.set(key, [valueOf(row)]);
  }
  return groups;
}
