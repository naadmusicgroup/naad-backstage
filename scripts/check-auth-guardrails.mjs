import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

function importMetaServerBranch(source) {
  const marker = "if (import.meta.server)"
  const start = source.indexOf(marker)

  if (start === -1) {
    return ""
  }

  const openingBrace = source.indexOf("{", start)

  if (openingBrace === -1) {
    return ""
  }

  let depth = 0

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index]

    if (character === "{") {
      depth += 1
    } else if (character === "}") {
      depth -= 1
    }

    if (depth === 0) {
      return source.slice(openingBrace + 1, index)
    }
  }

  return ""
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
      {
        label: "Client auth user id uses a short bounded cache before network getUser fallback",
        test: (source) =>
          /CLIENT_AUTH_USER_ID_CACHE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(source)
          && /function decodeJwtSubject\(accessToken: string \| null \| undefined\)/.test(source)
          && /const sessionUserId = decodeJwtSubject\(session\.value\?\.access_token\)/.test(source)
          && /cachedClientAuthUserId\.expiresAt > Date\.now\(\)/.test(source)
          && source.indexOf("const sessionUserId = decodeJwtSubject(session.value?.access_token)") < source.indexOf("supabase.auth.getUser()"),
      },
      {
        label: "Clearing viewer context also clears cached client auth user id",
        test: (source) => /function clearViewerContext\(\)\s*{[\s\S]*clearClientAuthUserIdCache\(\)[\s\S]*viewer\.value = guestContext\(\)/m.test(source),
      },
    ],
  },
  {
    file: "app/plugins/auth-state.client.ts",
    checks: [
      {
        label: "Auth state listener reuses hydrated viewer context for existing sessions",
        test: (source) =>
          /refreshViewerContext\(false,\s*session\.user\.id\)/.test(source)
          && !/refreshViewerContext\(true,\s*session\.user\.id\)/.test(source),
      },
      {
        label: "Auth state listener only clears an authenticated viewer on sign-out",
        test: (source) => /if\s*\(viewer\.value\.authenticated\)\s*{[\s\S]*clearViewerContext\(\)/m.test(source),
      },
    ],
  },
  {
    file: "app/components/AccountLoginMethods.vue",
    checks: [
      {
        label: "Google disconnect and reconnect require password login",
        test: (source) =>
          /const canDisconnectGoogle = computed\(\(\) => hasGoogleIdentity\.value && hasPasswordIdentity\.value\)/.test(source)
          && /const canReconnectGoogle = computed\(\(\) => hasGoogleIdentity\.value && hasPasswordIdentity\.value && currentLoginEmailIsGmail\.value\)/.test(source)
          && !/hasAlternativeLoginMethod/.test(source),
      },
      {
        label: "Google linked email must match the login email",
        test: (source) =>
          /const googleIdentityMatchesLoginEmail = computed/.test(source)
          && /googleIdentityEmails\.value\.every\(\(email\) => email === loginEmail\)/.test(source)
          && /Disconnect or reconnect Google before changing the login email to a different Gmail\./.test(source),
      },
    ],
  },
  {
    file: "app/server/api/auth/login-complete.post.ts",
    checks: [
      {
        label: "Google sign-in completion rejects mismatched linked Gmail",
        test: (source) =>
          /googleIdentityEmailsMatchLogin/.test(source)
          && /Google sign-in must use the same Gmail address as this account's login email\./.test(source),
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
        label: "Artist middleware reuses global SSR viewer context",
        test: (source) => /const context = viewer\.value/.test(importMetaServerBranch(source)),
      },
      {
        label: "Artist middleware does not refresh viewer context on SSR",
        test: (source) => !/refreshViewerContext\(/.test(importMetaServerBranch(source)),
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
        label: "Admin middleware reuses global SSR viewer context",
        test: (source) => /const context = viewer\.value/.test(importMetaServerBranch(source)),
      },
      {
        label: "Admin middleware does not refresh viewer context on SSR",
        test: (source) => !/refreshViewerContext\(/.test(importMetaServerBranch(source)),
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
