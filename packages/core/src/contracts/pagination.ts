import { z } from "zod";

export const cursorPaginationQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

export interface CursorPaginationResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export function paginateArray<T extends { id?: string | undefined }>(
  items: readonly T[],
  query: { cursor?: string | undefined; limit?: number | undefined },
): CursorPaginationResult<T> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  let startIndex = 0;

  if (query.cursor) {
    const foundIndex = items.findIndex((item) => item.id === query.cursor);
    if (foundIndex !== -1) {
      startIndex = foundIndex + 1;
    }
  }

  const sliced = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  const nextItem = sliced[sliced.length - 1];
  const nextCursor = hasMore && nextItem && typeof nextItem.id === "string" ? nextItem.id : null;

  return {
    items: sliced,
    nextCursor,
    hasMore,
  };
}
