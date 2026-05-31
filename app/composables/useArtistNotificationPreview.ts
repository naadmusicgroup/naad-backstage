import type { InjectionKey, Ref } from "vue"
import type { ArtistNotificationsResponse } from "~~/types/dashboard"

interface ArtistNotificationPreviewError {
  message?: string
  statusMessage?: string
}

interface ArtistNotificationPreviewContext {
  data: Ref<ArtistNotificationsResponse | null | undefined>
  error: Ref<ArtistNotificationPreviewError | null | undefined>
  refresh: () => Promise<void> | void
}

const artistNotificationPreviewKey: InjectionKey<ArtistNotificationPreviewContext> = Symbol("artist-notification-preview")

export function provideArtistNotificationPreview(context: ArtistNotificationPreviewContext) {
  provide(artistNotificationPreviewKey, context)
}

export function useArtistNotificationPreview() {
  return inject(artistNotificationPreviewKey, null)
}
