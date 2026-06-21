/**
 * Shrink app/assets/data/eckert3-world.geojson for the analytics world map.
 *
 * The map is a country-level choropleth rendered tiny on screen, so full-precision
 * coordinates (~3.4MB raw, inlined into the analytics bundle via `?raw` and
 * JSON.parse'd on the main thread) are wasted bytes that block the route
 * transition and spam Nuxt's dev source-map parser.
 *
 * This pass is NON-DESTRUCTIVE: it reads the original, quantizes every coordinate
 * to `PRECISION` decimal places, drops consecutive duplicate points created by the
 * rounding, and writes a NEW minified file. The original is left untouched so you
 * can eyeball the diff and revert trivially.
 *
 *   node scripts/shrink-world-geojson.mjs            # 2dp (~1.1km), safe default
 *   node scripts/shrink-world-geojson.mjs 1          # 1dp (~11km), smaller still
 *
 * Then point the import at the new file:
 *   - import worldGeoJsonRaw from "~~/app/assets/data/eckert3-world.geojson?raw"
 *   + import worldGeoJsonRaw from "~~/app/assets/data/eckert3-world.min.geojson?raw"
 *
 * For an even smaller result with real vertex removal, prefer mapshaper:
 *   npx mapshaper app/assets/data/eckert3-world.geojson \
 *     -simplify 8% keep-shapes -o format=geojson precision=0.01 \
 *     app/assets/data/eckert3-world.min.geojson
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"

const PRECISION = Number(process.argv[2] ?? 2)
const factor = 10 ** PRECISION

const rootDir = process.cwd()
const inputPath = path.join(rootDir, "app/assets/data/eckert3-world.geojson")
const outputPath = path.join(rootDir, "app/assets/data/eckert3-world.min.geojson")

const round = (value) => Math.round(value * factor) / factor

/** Round a [lng, lat] pair. */
function roundPoint(point) {
  return [round(point[0]), round(point[1])]
}

/** Round a ring and drop points that collapse onto their predecessor. */
function roundRing(ring) {
  const out = []
  let prev = null

  for (const point of ring) {
    const rounded = roundPoint(point)

    if (!prev || rounded[0] !== prev[0] || rounded[1] !== prev[1]) {
      out.push(rounded)
      prev = rounded
    }
  }

  // A polygon ring needs at least 4 positions (first === last). If rounding
  // collapsed it too far, fall back to the rounded original so we never emit a
  // degenerate ring that would break rendering.
  return out.length >= 4 ? out : ring.map(roundPoint)
}

function roundGeometry(geometry) {
  if (!geometry || !geometry.coordinates) {
    return geometry
  }

  if (geometry.type === "Polygon") {
    geometry.coordinates = geometry.coordinates.map(roundRing)
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates = geometry.coordinates.map((polygon) => polygon.map(roundRing))
  }

  return geometry
}

const geojson = JSON.parse(readFileSync(inputPath, "utf8"))

for (const feature of geojson.features ?? []) {
  feature.geometry = roundGeometry(feature.geometry)
}

writeFileSync(outputPath, JSON.stringify(geojson))

const before = statSync(inputPath).size
const after = statSync(outputPath).size
const pct = ((1 - after / before) * 100).toFixed(1)

console.log(`world geojson: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (-${pct}%) at ${PRECISION}dp`)
console.log(`wrote ${path.relative(rootDir, outputPath)} — original left untouched; swap the import when you're happy with it.`)
