export default defineNuxtPlugin((nuxtApp) => {
  const supabase = useSupabaseClient()
  const { clearViewerContext, refreshViewerContext, viewer } = useViewerContext()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      void refreshViewerContext(false, session.user.id).catch(() => undefined)
      return
    }

    if (viewer.value.authenticated) {
      clearViewerContext()
    }
  })
})
