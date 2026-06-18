import { Readable } from "node:stream"
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createError } from "h3"

const S3_MEDIA_KEY_PATTERN = /^(?:releases|artists|brand|Transactions-doc)\//
const DEFAULT_S3_REGION = "ap-south-1"
const DEFAULT_S3_BUCKET = "naadmusicgroup"

interface S3MediaConfig {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

let cachedClient: S3Client | null = null
let cachedClientSignature = ""

function envValue(name: string) {
  return String(process.env[name] ?? "").trim()
}

function normalizePublicBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
}

function mediaStorageProvider() {
  return envValue("MEDIA_STORAGE_PROVIDER").toLowerCase() || "supabase"
}

export function slugifyStorageSegment(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  return normalized || fallback
}

export function readableStorageSegment(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return normalized || fallback
}

export function artistMediaFolder(artistId: string, artistName?: string | null) {
  return readableStorageSegment(artistName, "Artist")
}

function optionalS3PublicBaseUrl() {
  return normalizePublicBaseUrl(envValue("S3_PUBLIC_BASE_URL"))
}

function requiredS3Config(): S3MediaConfig {
  const config = {
    bucket: envValue("S3_BUCKET") || DEFAULT_S3_BUCKET,
    region: envValue("S3_REGION") || DEFAULT_S3_REGION,
    accessKeyId: envValue("S3_ACCESS_KEY_ID"),
    secretAccessKey: envValue("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: optionalS3PublicBaseUrl(),
  }

  if (!config.bucket || !config.region || !config.accessKeyId || !config.secretAccessKey || !config.publicBaseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: "NaadMusicGroup media storage is not configured.",
    })
  }

  return config
}

function s3Client(config: S3MediaConfig) {
  const signature = `${config.region}:${config.bucket}:${config.accessKeyId}`

  if (cachedClient && cachedClientSignature === signature) {
    return cachedClient
  }

  cachedClient = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  cachedClientSignature = signature
  return cachedClient
}

export function isS3MediaStorageEnabled() {
  return mediaStorageProvider() === "s3"
}

export function assertS3MediaStorageConfigured() {
  requiredS3Config()
}

export function mediaBucketName() {
  return envValue("S3_BUCKET") || DEFAULT_S3_BUCKET
}

export function normalizeS3MediaKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
}

export function isS3MediaKey(value: string | null | undefined) {
  return S3_MEDIA_KEY_PATTERN.test(normalizeS3MediaKey(value))
}

function requireManagedS3MediaKey(value: string) {
  const key = normalizeS3MediaKey(value)

  if (!isS3MediaKey(key)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Invalid NaadMusicGroup media storage path.",
    })
  }

  return key
}

export function publicMediaUrlForKey(key: string) {
  const config = requiredS3Config()
  const normalizedKey = requireManagedS3MediaKey(key)
  const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/")

  return `${config.publicBaseUrl}/${encodedKey}`
}

export function mediaStorageKeyFromPublicUrl(value: string | null | undefined) {
  const rawValue = String(value ?? "").trim()

  if (!rawValue) {
    return null
  }

  const normalizedDirectKey = normalizeS3MediaKey(rawValue)

  if (!/^https?:\/\//i.test(rawValue) && isS3MediaKey(normalizedDirectKey)) {
    return normalizedDirectKey
  }

  const baseValue = optionalS3PublicBaseUrl()

  if (!baseValue) {
    return null
  }

  try {
    const url = new URL(rawValue)
    const baseUrl = new URL(baseValue)

    if (url.origin !== baseUrl.origin) {
      return null
    }

    const basePath = baseUrl.pathname.replace(/\/+$/, "")

    if (basePath && basePath !== "/" && !url.pathname.startsWith(`${basePath}/`)) {
      return null
    }

    const encodedKey = url.pathname.slice(basePath.length).replace(/^\/+/, "")
    const key = decodeURIComponent(encodedKey)

    return isS3MediaKey(key) ? normalizeS3MediaKey(key) : null
  } catch {
    return null
  }
}

export function mediaBufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

async function responseBodyToBuffer(body: unknown) {
  if (!body) {
    return Buffer.alloc(0)
  }

  if (Buffer.isBuffer(body)) {
    return body
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body)
  }

  const bodyWithByteArray = body as { transformToByteArray?: () => Promise<Uint8Array> }

  if (typeof bodyWithByteArray.transformToByteArray === "function") {
    return Buffer.from(await bodyWithByteArray.transformToByteArray())
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = []

    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  }

  throw createError({
    statusCode: 500,
    statusMessage: "Unable to read the selected media object.",
  })
}

export async function createMediaUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 15 * 60,
) {
  const config = requiredS3Config()
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: requireManagedS3MediaKey(key),
    ContentType: contentType || "application/octet-stream",
  })

  return await getSignedUrl(s3Client(config), command, { expiresIn })
}

export async function uploadMediaBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
) {
  const config = requiredS3Config()

  try {
    await s3Client(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: requireManagedS3MediaKey(key),
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }))
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to save media to NaadMusicGroup storage.",
    })
  }
}

export async function createMediaFolderMarkers(folders: string[]) {
  const config = requiredS3Config()
  const client = s3Client(config)

  for (const folder of folders) {
    const key = `${requireManagedS3MediaKey(folder).replace(/\/+$/, "")}/`

    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.alloc(0),
      ContentType: "application/x-directory",
    }))
  }
}

export async function downloadMediaBuffer(key: string) {
  const config = requiredS3Config()

  try {
    const response = await s3Client(config).send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: requireManagedS3MediaKey(key),
    }))
    const buffer = await responseBodyToBuffer(response.Body)

    return {
      buffer,
      contentLength: response.ContentLength ?? buffer.byteLength,
      contentType: response.ContentType || "application/octet-stream",
    }
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to download media from NaadMusicGroup storage.",
    })
  }
}

export async function deleteMediaObject(key: string) {
  const config = requiredS3Config()

  try {
    await s3Client(config).send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: requireManagedS3MediaKey(key),
    }))
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to delete media from NaadMusicGroup storage.",
    })
  }
}

export async function deleteMediaPrefix(prefix: string) {
  const config = requiredS3Config()
  const client = s3Client(config)
  const normalizedPrefix = requireManagedS3MediaKey(prefix)
  let continuationToken: string | undefined
  let removedCount = 0

  try {
    do {
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      }))
      const keys = (listed.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key))

      for (let index = 0; index < keys.length; index += 1000) {
        const chunk = keys.slice(index, index + 1000)

        if (!chunk.length) {
          continue
        }

        await client.send(new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }))
        removedCount += chunk.length
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
    } while (continuationToken)
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Unable to clean NaadMusicGroup media storage.",
    })
  }

  return removedCount
}

export async function deleteMediaFoldersEndingWith(parentPrefix: string, folderSuffix: string) {
  const config = requiredS3Config()
  const client = s3Client(config)
  const normalizedParentPrefix = `${requireManagedS3MediaKey(parentPrefix).replace(/\/+$/, "")}/`
  const normalizedFolderSuffix = folderSuffix.replace(/\/+$/, "")
  let continuationToken: string | undefined
  let removedCount = 0

  try {
    do {
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: normalizedParentPrefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }))

      for (const commonPrefix of listed.CommonPrefixes ?? []) {
        const prefix = commonPrefix.Prefix

        if (!prefix) {
          continue
        }

        const folderName = prefix
          .slice(normalizedParentPrefix.length)
          .replace(/\/+$/, "")

        if (folderName.endsWith(normalizedFolderSuffix)) {
          removedCount += await deleteMediaPrefix(prefix)
        }
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
    } while (continuationToken)
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Unable to clean NaadMusicGroup media storage.",
    })
  }

  return removedCount
}
