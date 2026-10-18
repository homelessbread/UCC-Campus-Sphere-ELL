import { dbError } from './db-error';

/** PostgREST returns at most 1000 rows per request. This reads every page of a query. */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw dbError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}
