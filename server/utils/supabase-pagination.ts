import { createError } from "h3"

export const SUPABASE_PAGE_SIZE = 1000
export const SUPABASE_IN_FILTER_CHUNK_SIZE = 500

interface SupabasePageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export function throwSupabaseError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

export async function fetchAllPages<T>(
  fallback: string,
  makeQuery: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
) {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await makeQuery(from, to)

    throwSupabaseError(error, fallback)

    const page = data ?? []
    rows.push(...page)

    if (page.length < pageSize) {
      break
    }
  }

  return rows
}

export function chunkItems<T>(items: T[], size = SUPABASE_IN_FILTER_CHUNK_SIZE) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

export async function fetchAllByChunks<T, TChunkValue>(
  values: TChunkValue[],
  fallback: string,
  makeQuery: (chunk: TChunkValue[], from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
  chunkSize = SUPABASE_IN_FILTER_CHUNK_SIZE,
) {
  const rows: T[] = []

  for (const chunk of chunkItems(values, chunkSize)) {
    rows.push(...await fetchAllPages<T>(
      fallback,
      (from, to) => makeQuery(chunk, from, to),
    ))
  }

  return rows
}
