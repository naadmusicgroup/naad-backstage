export function useAuthLightTheme() {
  useHead({
    htmlAttrs: {
      class: "light",
      "data-theme": "light",
      style: "color-scheme: light;",
    },
  })

  onMounted(() => {
    const root = document.documentElement
    root.classList.remove("dark")
    root.classList.add("light")
    root.dataset.theme = "light"
    root.style.colorScheme = "light"
  })
}
