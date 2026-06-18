import { createError } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { CSV_UPLOAD_BUCKET } from "~~/server/utils/imports"
import { RELEASE_ASSET_BUCKET } from "~~/server/utils/release-assets"
import { ARTIST_AVATAR_BUCKET } from "~~/server/utils/artist-avatars"
import {
  artistMediaFolder,
  deleteMediaFoldersEndingWith,
  deleteMediaPrefix,
  isS3MediaStorageEnabled,
} from "~~/server/utils/media-storage"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  countLinkedArtists,
  deleteAuthUserOrFail,
  loadAdminArtistLifecycleTarget,
  setAccountBanState,
  type AdminArtistLifecycleRpcResult,
} from "~~/server/utils/admin-artist-lifecycle"
import type {
  AdminArtistPermanentDeleteResult,
  AdminArtistStorageCleanupResult,
} from "~~/types/settings"

const STORAGE_PAGE_SIZE = 1000

interface PermanentDeleteOptions {
  logAction?: string | null
}

interface StorageCleanupTarget {
  bucket: string
  prefix: string
  key: keyof Omit<AdminArtistStorageCleanupResult, "totalObjectsRemoved">
}

function emptyStorageCleanupResult(): AdminArtistStorageCleanupResult {
  return {
    csvImports: 0,
    releaseAssets: 0,
    artistAvatars: 0,
    totalObjectsRemoved: 0,
  }
}

function isMissingStorageTarget(error: any) {
  const status = Number(error?.statusCode ?? error?.status ?? 0)
  const message = String(error?.message ?? "").toLowerCase()

  return status === 404 || (
    message.includes("not found")
    || message.includes("does not exist")
    || message.includes("bucket")
  )
}

function joinStoragePath(path: string, name: string) {
  return path ? `${path}/${name}` : name
}

function chunkStoragePaths(paths: string[]) {
  const chunks: string[][] = []

  for (let index = 0; index < paths.length; index += STORAGE_PAGE_SIZE) {
    chunks.push(paths.slice(index, index + STORAGE_PAGE_SIZE))
  }

  return chunks
}

async function listStorageFiles(
  supabase: SupabaseClient<any>,
  bucket: string,
  prefix: string,
) {
  const files: string[] = []

  async function walk(path: string) {
    let offset = 0

    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path, {
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        })

      if (error) {
        if (isMissingStorageTarget(error)) {
          return
        }

        throw createError({
          statusCode: 502,
          statusMessage: error.message || `Unable to list ${bucket} storage objects.`,
        })
      }

      const entries = data ?? []

      for (const entry of entries) {
        if (!entry?.name) {
          continue
        }

        const storagePath = joinStoragePath(path, entry.name)

        if (entry.id || entry.metadata) {
          files.push(storagePath)
        } else {
          await walk(storagePath)
        }
      }

      if (entries.length < STORAGE_PAGE_SIZE) {
        break
      }

      offset += entries.length
    }
  }

  await walk(prefix.replace(/\/+$/, ""))
  return files
}

async function removeStoragePrefix(
  supabase: SupabaseClient<any>,
  bucket: string,
  prefix: string,
) {
  const files = await listStorageFiles(supabase, bucket, prefix)

  for (const chunk of chunkStoragePaths(files)) {
    const { error } = await supabase.storage.from(bucket).remove(chunk)

    if (error) {
      if (isMissingStorageTarget(error)) {
        continue
      }

      throw createError({
        statusCode: 502,
        statusMessage: error.message || `Unable to remove ${bucket} storage objects.`,
      })
    }
  }

  return files.length
}

export async function cleanupArtistStorage(
  supabase: SupabaseClient<any>,
  artistId: string,
  artistName?: string | null,
) {
  const result = emptyStorageCleanupResult()
  const targets: StorageCleanupTarget[] = [
    { bucket: CSV_UPLOAD_BUCKET, prefix: `csv/${artistId}`, key: "csvImports" },
    { bucket: RELEASE_ASSET_BUCKET, prefix: artistId, key: "releaseAssets" },
    { bucket: ARTIST_AVATAR_BUCKET, prefix: artistId, key: "artistAvatars" },
  ]

  for (const target of targets) {
    result[target.key] = await removeStoragePrefix(supabase, target.bucket, target.prefix)
  }

  if (isS3MediaStorageEnabled()) {
    const readableArtistFolder = artistMediaFolder(artistId, artistName)

    result.releaseAssets += await deleteMediaPrefix(`releases/${artistId}/`)
    result.releaseAssets += await deleteMediaPrefix(`releases/audio/${readableArtistFolder}/`)
    result.releaseAssets += await deleteMediaPrefix(`releases/cover-art/${readableArtistFolder}/`)
    result.releaseAssets += await deleteMediaPrefix(`releases/cover-thumbnails/${readableArtistFolder}/`)
    result.releaseAssets += await deleteMediaFoldersEndingWith("releases/audio/", `--${artistId}`)
    result.releaseAssets += await deleteMediaFoldersEndingWith("releases/cover-art/", `--${artistId}`)
    result.releaseAssets += await deleteMediaFoldersEndingWith("releases/cover-thumbnails/", `--${artistId}`)
    result.artistAvatars += await deleteMediaPrefix(`artists/${artistId}/avatars/`)
    result.artistAvatars += await deleteMediaPrefix(`artists/${readableArtistFolder}/`)
    result.artistAvatars += await deleteMediaFoldersEndingWith("artists/", `--${artistId}`)
  }

  result.totalObjectsRemoved = result.csvImports + result.releaseAssets + result.artistAvatars
  return result
}

export async function permanentlyDeleteArtistForAdmin(
  supabase: SupabaseClient<any>,
  adminId: string,
  artistId: string,
  options: PermanentDeleteOptions = {},
) {
  const artist = await loadAdminArtistLifecycleTarget(supabase, artistId)
  const storageCleanup = await cleanupArtistStorage(supabase, artistId, artist.name)
  let preBannedForCleanup = false

  if (artist.user_id && await countLinkedArtists(supabase, artist.user_id) === 1) {
    await setAccountBanState(supabase, artist.user_id, true)
    preBannedForCleanup = true
  }

  const { data, error } = await supabase.rpc("admin_purge_artist", {
    target_artist_uuid: artistId,
  })

  const rpcResult = Array.isArray(data) ? data[0] : data

  if (error || !rpcResult) {
    if (preBannedForCleanup && artist.user_id) {
      await setAccountBanState(supabase, artist.user_id, false)
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to permanently delete this artist.",
    })
  }

  const lifecycleResult = rpcResult as AdminArtistLifecycleRpcResult
  let removedAuthUserId: string | null = null

  if (lifecycleResult.profile_became_unused && lifecycleResult.linked_user_id) {
    await deleteAuthUserOrFail(
      supabase,
      lifecycleResult.linked_user_id,
      "The artist data was deleted, but the old login account could not be removed. It remains banned. Retry the cleanup.",
    )
    removedAuthUserId = lifecycleResult.linked_user_id
  } else if (preBannedForCleanup && lifecycleResult.linked_user_id) {
    await setAccountBanState(supabase, lifecycleResult.linked_user_id, false)
  }

  const result: AdminArtistPermanentDeleteResult = {
    artistId,
    artistName: artist.name,
    affectedUserId: lifecycleResult.linked_user_id,
    removedAuthUserId,
    profileDeleted: lifecycleResult.profile_became_unused,
    remainingLinkedArtistCount: lifecycleResult.remaining_linked_artist_count,
    storageCleanup,
  }

  if (options.logAction) {
    await logAdminActivity(supabase, adminId, options.logAction, "artist", artistId, {
      artist_id: result.artistId,
      artist_name: result.artistName,
      removed_login_user_id: result.removedAuthUserId,
      affected_user_id: result.affectedUserId,
      profile_deleted: result.profileDeleted,
      remaining_linked_artist_count: result.remainingLinkedArtistCount,
      storage_cleanup: result.storageCleanup,
    })
  }

  return result
}

export function aggregateArtistStorageCleanup(results: AdminArtistPermanentDeleteResult[]) {
  return results.reduce((summary, result) => {
    summary.csvImports += result.storageCleanup.csvImports
    summary.releaseAssets += result.storageCleanup.releaseAssets
    summary.artistAvatars += result.storageCleanup.artistAvatars
    summary.totalObjectsRemoved += result.storageCleanup.totalObjectsRemoved
    return summary
  }, emptyStorageCleanupResult())
}
