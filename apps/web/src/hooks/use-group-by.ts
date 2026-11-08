import { useMemo } from "react";

export function useGroupBy<T extends Record<string, unknown>>(
  items: T[],
  getKey: (item: T) => string,
  order?: string[],
) {
  return useMemo(() => {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
      const key = getKey(item) || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const keys = Object.keys(groups);
    const sortedKeys = order
      ? [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))]
      : keys.sort();
    return { groups, order: sortedKeys };
  }, [items, getKey, order]);
}
