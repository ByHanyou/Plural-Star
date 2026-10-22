export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

export const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export const countUp = <K>(map: Map<K, number>, key: K, by = 1): void => {
  map.set(key, (map.get(key) || 0) + by);
};

export const byValueDesc = <K>(map: Map<K, number>): [K, number][] =>
  [...map].sort((a, b) => b[1] - a[1]);

export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export const asRecord = (v: unknown): Record<string, unknown> | null => (isRecord(v) ? v : null);

export const applySortOrder = <T extends {id: string; sortOrder?: number}>(items: T[], orderedIds: string[]): T[] => {
  const pos = new Map(orderedIds.map((id, i) => [id, i] as const));
  return items.map(c => (pos.has(c.id) ? {...c, sortOrder: pos.get(c.id)} : c));
};

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export const toggleId = (list: string[], id: string): string[] => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

export const toggleInSet = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
};

export const upsertById = <T extends {id: string}>(list: T[], item: T, prepend = false): T[] =>
  list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : prepend ? [item, ...list] : [...list, item];

export const moveInList = <T>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const withSortOrder = <T extends {sortOrder?: number}>(list: T[]): T[] => list.map((item, i) => ({...item, sortOrder: i}));
