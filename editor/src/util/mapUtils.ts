export function nextId(map: { [key: number]: any }): number {
  return Math.max(
    ...Object
      .keys(map)
      .map((k) => parseInt(k)), -1) + 1;
}
