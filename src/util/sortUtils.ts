interface Nameable {
  name: string;
}

export function sortedEntries<T extends Nameable>(
  object: Record<string, T>,
): Array<[string, T]> {
  return Object.entries(object).sort(([aKey, a], [bKey, b]) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return aKey.localeCompare(bKey);
  });
}
