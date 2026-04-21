import fs from "node:fs"
import path from "node:path"

type EnvMap = Record<string, string>

let cachedEnv: EnvMap | null = null

const defaultSmokeValues: EnvMap = {
  SMOKE_BASE_URL: "",
  SMOKE_ADMIN_EMAIL: "smoke-admin@naad-backstage.local",
  SMOKE_ADMIN_PASSWORD: "SmokeAdmin123!",
  SMOKE_ARTIST_EMAIL: "smoke-artist@naad-backstage.local",
  SMOKE_ARTIST_PASSWORD: "SmokeArtist123!",
}

function parseEnvFile(content: string): EnvMap {
  const values: EnvMap = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

function loadDotEnv(): EnvMap {
  if (cachedEnv) {
    return cachedEnv
  }

  const envPath = path.resolve(process.cwd(), ".env")

  if (!fs.existsSync(envPath)) {
    cachedEnv = {}
    return cachedEnv
  }

  cachedEnv = parseEnvFile(fs.readFileSync(envPath, "utf8"))
  return cachedEnv
}

export function readEnv(name: string): string {
  return process.env[name] ?? loadDotEnv()[name] ?? defaultSmokeValues[name] ?? ""
}

export function readRequiredEnv(names: string[]): { missing: string[]; values: EnvMap } {
  const missing: string[] = []
  const values: EnvMap = {}

  for (const name of names) {
    const value = readEnv(name)

    if (!value) {
      missing.push(name)
      continue
    }

    values[name] = value
  }

  return {
    missing,
    values,
  }
}
