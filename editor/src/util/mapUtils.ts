export const UNSET_INDEX = 0;

export function nextId(map: { [key: number]: any }): number {
  return Math.max(...Object.keys(map).map((k) => parseInt(k)), UNSET_INDEX) + 1;
}

export function idMapToArray<T>(
  map: { [key: number]: T } | undefined,
): Array<[number, T]> {
  if (map == null) {
    return [];
  }

  return Object.entries(map).map(([idString, t]) => [parseInt(idString), t]);
}
