import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

const guardrails = [
  {
    file: "nuxt.config.ts",
    checks: [
      {
        label: "Nuxt app manifest stays disabled in this project",
        test: (source) => /experimental\s*:\s*{[\s\S]*appManifest\s*:\s*false[\s\S]*}/m.test(source),
      },
    ],
  },
  {
    file: "app/composables/useViewerContext.ts",
    checks: [
      {
        label: "SSR viewer refresh uses request-aware fetch",
        test: (source) =>
          /if\s*\(!process\.client\)\s*{[\s\S]*useRequestFetch\(\)[\s\S]*requestFetch<ViewerContext>\("\/api\/me"\)/m.test(source),
      },
    ],
  },
  {
    file: "app/middleware/auth.global.ts",
    checks: [
      {
        label: "Global auth middleware has an SSR branch",
        test: (source) => /if\s*\(import\.meta\.server\)/.test(source),
      },
      {
        label: "Global auth middleware refreshes viewer context on SSR",
        test: (source) => /const context = await refreshViewerContext\(true\)/.test(source),
      },
    ],
  },
  {
    file: "app/middleware/artist.ts",
    checks: [
      {
        label: "Artist middleware has an SSR branch",
        test: (source) => /if\s*\(import\.meta\.server\)/.test(source),
      },
      {
        label: "Artist middleware refreshes viewer context on SSR",
        test: (source) => /const context = await refreshViewerContext\(true\)/.test(source),
      },
    ],
  },
  {
    file: "app/middleware/admin.ts",
    checks: [
      {
        label: "Admin middleware has an SSR branch",
        test: (source) => /if\s*\(import\.meta\.server\)/.test(source),
      },
      {
        label: "Admin middleware refreshes viewer context on SSR",
        test: (source) => /const context = await refreshViewerContext\(true\)/.test(source),
      },
    ],
  },
]

const failures = []

for (const rule of guardrails) {
  const source = readFile(rule.file)

  for (const check of rule.checks) {
    if (!check.test(source)) {
      failures.push(`${rule.file}: ${check.label}`)
    }
  }
}

if (failures.length) {
  console.error("Auth/navigation guardrails failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Auth/navigation guardrails passed.")
