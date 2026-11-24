import type { CursorPage } from '@nyx/contracts';

export interface CursorPagination {
  limit: number;
  cursor?: string | undefined;
}

export function makeCursorPage<T extends { id: string }>(
  records: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = records.length > limit;
  const items = hasMore ? records.slice(0, limit) : records;
  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    hasMore,
  };
}
