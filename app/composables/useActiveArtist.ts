export const useActiveArtist = () => {
  const { viewer } = useViewerContext()
  const selectedArtistId = useCookie<string | null>("naad-active-artist-id", {
    sameSite: "lax",
  })

  const artistMemberships = computed(() => viewer.value.artistMemberships)
  const hasMultipleArtists = computed(() => artistMemberships.value.length > 1)

  const activeArtistId = computed<string>({
    get() {
      if (!artistMemberships.value.length) {
        return ""
      }

      if (
        selectedArtistId.value
        && artistMemberships.value.some((artist) => artist.id === selectedArtistId.value)
      ) {
        return selectedArtistId.value
      }

      return artistMemberships.value[0].id
    },
    set(value) {
      if (!artistMemberships.value.length) {
        selectedArtistId.value = null
        return
      }

      selectedArtistId.value = artistMemberships.value.some((artist) => artist.id === value)
        ? value
        : artistMemberships.value[0].id
    },
  })

  const activeArtist = computed(() => {
    return artistMemberships.value.find((artist) => artist.id === activeArtistId.value) ?? null
  })

  watch(
    artistMemberships,
    (memberships) => {
      if (!memberships.length) {
        selectedArtistId.value = null
        return
      }

      if (!memberships.some((artist) => artist.id === selectedArtistId.value)) {
        selectedArtistId.value = memberships[0].id
      }
    },
    { immediate: true },
  )

  function clearActiveArtist() {
    selectedArtistId.value = null
  }

  return {
    activeArtistId,
    activeArtist,
    hasMultipleArtists,
    clearActiveArtist,
  }
}
