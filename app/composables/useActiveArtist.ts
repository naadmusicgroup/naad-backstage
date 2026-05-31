export const useActiveArtist = () => {
  const { viewer } = useViewerContext()

  const artistMemberships = computed(() => viewer.value.artistMemberships)
  const hasMultipleArtists = computed(() => false)

  const activeArtistId = computed<string>({
    get() {
      return artistMemberships.value[0]?.id ?? ""
    },
    set() {},
  })

  const activeArtist = computed(() => {
    return artistMemberships.value[0] ?? null
  })

  function clearActiveArtist() {}

  return {
    activeArtistId,
    activeArtist,
    hasMultipleArtists,
    clearActiveArtist,
  }
}
