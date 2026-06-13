import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const envPath = path.resolve(process.cwd(), ".env");
const localEnv = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
const readEnv = (name, fallback = "") => process.env[name] ?? localEnv[name] ?? fallback;
const supabaseUrl = readEnv("NUXT_PUBLIC_SUPABASE_URL");
const secretKey = readEnv("SUPABASE_SECRET_KEY");
if (!supabaseUrl || !secretKey) throw new Error("Missing Supabase smoke seed env");
const email = readEnv("SMOKE_ARTIST_EMAIL", "smoke-artist@naad-backstage.local");
const password = readEnv("SMOKE_ARTIST_PASSWORD", "SmokeArtist123!");
const fullName = "Smoke Artist";
const stageName = "Smoke Artist";
const country = "Nepal";
const bio = "Smoke-test artist profile";
const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function findUserByEmail(targetEmail) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}
const existing = await findUserByEmail(email);
let user;
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw error ?? new Error("Unable to update smoke artist user");
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw error ?? new Error("Unable to create smoke artist user");
  user = data.user;
}
const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName, role: "artist", country, bio }, { onConflict: "id" });
if (profileError) throw profileError;
const { data: existingArtist, error: existingArtistError } = await supabase.from("artists").select("id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
if (existingArtistError) throw existingArtistError;
let artistId = existingArtist?.id;
if (artistId) {
  const { error } = await supabase.from("artists").update({ name: stageName, email, country, bio, is_active: true }).eq("id", artistId);
  if (error) throw error;
} else {
  const { data, error } = await supabase.from("artists").insert({ user_id: user.id, name: stageName, email, country, bio, is_active: true }).select("id").single();
  if (error || !data) throw error ?? new Error("Unable to create smoke artist record");
  artistId = data.id;
}
console.log(JSON.stringify({ ok: true, artistId, userId: user.id }));
