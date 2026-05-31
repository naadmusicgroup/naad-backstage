import type { Config } from "tailwindcss"

export default {
  content: [
    "./app/components/**/*.{vue,js,ts}",
    "./app/layouts/**/*.vue",
    "./app/pages/**/*.vue",
    "./app/plugins/**/*.{js,ts}",
    "./app/app.vue",
    "./server/**/*.{js,ts}",
  ],
  darkMode: ["class", ".dark"],
  theme: {
    extend: {},
  },
} satisfies Config
