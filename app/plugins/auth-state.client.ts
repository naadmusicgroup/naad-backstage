export default defineNuxtPlugin((nuxtApp) => {
  const supabase = useSupabaseClient()
  const { clearViewerContext, refreshViewerContext } = useViewerContext()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      void refreshViewerContext(true, session.user.id).catch(() => undefined)
      return
    }

    clearViewerContext()
  })
})
