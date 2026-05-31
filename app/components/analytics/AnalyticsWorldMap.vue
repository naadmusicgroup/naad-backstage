<script setup lang="ts">
import { X } from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import worldGeoJsonRaw from "~~/app/assets/data/eckert3-world.geojson?raw"
import {
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  formatAnalyticsShare,
  numeric,
} from "~~/app/utils/analytics-charts"
import { countryCodeFor, countryNameFor } from "~~/app/utils/country-flags"

interface AnalyticsGeoCountry {
  countryCode: string | null
  countryName: string
  revenue: string | number
  streams?: number
  share?: number
}

interface MapCountry extends AnalyticsGeoCountry {
  countryCode: string | null
  mapName: string
  revenue: number
  streams: number
  share: number
  path: string
}

interface WorldGeoJsonFeature {
  properties?: {
    name?: string
  }
  geometry?: {
    type?: string
    coordinates?: unknown
  }
}

interface WorldGeoJson {
  features?: WorldGeoJsonFeature[]
}

interface MapBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type TooltipPointerEvent = Pick<MouseEvent, "clientX" | "clientY">

const props = withDefaults(defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  countries: AnalyticsGeoCountry[]
  selectedCountryCode?: string | null
  emptyText?: string
}>(), {
  selectedCountryCode: null,
  emptyText: "No country revenue matches the current filters.",
})

const emit = defineEmits<{
  select: [country: MapCountry]
  clear: []
}>()

const worldGeoJson = JSON.parse(worldGeoJsonRaw) as WorldGeoJson
const worldFeatures = worldGeoJson.features ?? []
const mapFeatureNames = worldFeatures
  .map((feature) => feature.properties?.name)
  .filter((name): name is string => Boolean(name))
const mapPathByName = new Map<string, string>(worldFeatures.flatMap((feature): Array<[string, string]> => {
  const name = feature.properties?.name ?? ""
  const path = geometryPath(feature.geometry)

  return name && path ? [[name, path]] : []
}))
const mapBounds = geometryBounds(worldFeatures.map((feature) => feature.geometry?.coordinates))
const mapViewBox = `${mapBounds.minX} ${mapBounds.minY} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxY - mapBounds.minY}`

const mapFrameRef = ref<HTMLElement | null>(null)
const selectedName = ref<string | null>(null)
const hoveredName = ref<string | null>(null)
const tooltipPosition = reactive({
  x: 0,
  y: 0,
})

const countryNameAliases: Record<string, string> = {
  "United States": "the United States",
  "Russia": "the Russia Federation",
  "Czechia": "Czech Rep.",
  "South Korea": "Korea",
  "North Korea": "Dem. Rep. Korea",
  "DR Congo": "Dem. Rep. Congo",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Congo - Kinshasa": "Dem. Rep. Congo",
  "Congo - Brazzaville": "Congo",
  "Vietnam": "Vietnam",
  "United Arab Emirates": "United Arab Emirates",
}

const mapCountryCodeAliases: Record<string, string> = {
  "Aland": "AX",
  "Bolivia": "BO",
  "Brunei": "BN",
  "Congo": "CG",
  "Czech Rep.": "CZ",
  "Dem. Rep. Congo": "CD",
  "Dem. Rep. Korea": "KP",
  "Iran": "IR",
  "Korea": "KR",
  "Macedonia": "MK",
  "Moldova": "MD",
  "Palestine": "PS",
  "Syria": "SY",
  "Tanzania": "TZ",
  "the Russia Federation": "RU",
  "the United States": "US",
  "Venezuela": "VE",
  "Vietnam": "VN",
  "W. Sahara": "EH",
}

function mapNameForCountry(country: AnalyticsGeoCountry) {
  return countryNameAliases[country.countryName] ?? country.countryName
}

function countryCodeForMapName(value: string) {
  return countryCodeFor(mapCountryCodeAliases[value] ?? value)
}

function countryNameForMapCountry(mapName: string, countryCode: string | null) {
  if (!countryCode) {
    return countryNameFor(mapName, mapName)
  }

  return countryNameFor(countryCode, mapName)
}

const mapCountries = computed<MapCountry[]>(() => {
  const total = props.countries.reduce((sum, country) => sum + Math.max(0, numeric(country.revenue)), 0) || 1
  const countriesByMapName = new Map<string, MapCountry>()

  for (const country of props.countries) {
    const revenue = Math.max(0, numeric(country.revenue))
    const countryCode = countryCodeFor(country.countryCode || country.countryName)
    const mapName = mapNameForCountry(country)

    countriesByMapName.set(mapName, {
      ...country,
      countryCode,
      mapName,
      revenue,
      streams: Number(country.streams ?? 0),
      share: typeof country.share === "number" ? country.share : (revenue / total) * 100,
      path: mapPathByName.get(mapName) ?? "",
    })
  }

  const countries = mapFeatureNames.map((mapName) => {
    const existing = countriesByMapName.get(mapName)

    if (existing) {
      return existing
    }

    const countryCode = countryCodeForMapName(mapName)

    return {
      countryCode,
      countryName: countryNameForMapCountry(mapName, countryCode),
      mapName,
      revenue: 0,
      streams: 0,
      share: 0,
      path: mapPathByName.get(mapName) ?? "",
    }
  })

  for (const country of countriesByMapName.values()) {
    if (!mapFeatureNames.includes(country.mapName)) {
      countries.push(country)
    }
  }

  return countries
})

const drawableCountries = computed(() => mapCountries.value.filter((country) => country.path))
const rankedCountries = computed<MapCountry[]>(() => {
  return mapCountries.value
    .filter((country) => country.revenue > 0)
    .sort((left, right) => right.revenue - left.revenue)
})

const selectedCountry = computed(() => {
  const selectedCode = countryCodeFor(props.selectedCountryCode)

  if (selectedCode) {
    return mapCountries.value.find((country) => country.countryCode === selectedCode) ?? null
  }

  if (selectedName.value) {
    return mapCountries.value.find((country) => country.mapName === selectedName.value) ?? null
  }

  return null
})
const hoveredCountry = computed(() => {
  if (!hoveredName.value) {
    return null
  }

  return mapCountries.value.find((country) => country.mapName === hoveredName.value) ?? null
})
const worldMapTooltipStyle = computed<Record<string, string>>(() => ({
  left: `${tooltipPosition.x}px`,
  top: `${tooltipPosition.y}px`,
}))

const maxRevenue = computed(() => Math.max(1, ...mapCountries.value.map((country) => country.revenue)))

watch(
  () => props.selectedCountryCode,
  (value) => {
    if (!value) {
      selectedName.value = null
    }
  },
)

function selectCountry(country: MapCountry | null) {
  if (!country) {
    return
  }

  selectedName.value = country.mapName
  emit("select", country)
}

function clearCountry() {
  selectedName.value = null
  emit("clear")
}

function countryPathClass(country: MapCountry) {
  return [
    "world-map-country",
    country.revenue > 0 ? "has-revenue" : undefined,
    country.mapName === selectedCountry.value?.mapName ? "active" : undefined,
  ]
}

function countryPathStyle(country: MapCountry) {
  const fillStrength = country.revenue > 0
    ? `${Math.round(24 + Math.min(1, country.revenue / maxRevenue.value) * 62)}%`
    : "0%"

  return {
    "--country-fill": fillStrength,
  }
}

function countryPathTitle(country: MapCountry) {
  return `${country.countryName}: ${formatAnalyticsMoney(country.revenue)} revenue, ${formatAnalyticsShare(country.share)}, ${formatAnalyticsCompact(country.streams)} plays + impressions`
}

function handleCountryPathClick(country: MapCountry) {
  selectCountry(country)
}

function showCountryTooltip(country: MapCountry, event: MouseEvent | FocusEvent) {
  hoveredName.value = country.mapName

  if (hasPointerPosition(event)) {
    updateCountryTooltipPosition(event)
    return
  }

  updateCountryTooltipFromElement(event.currentTarget)
}

function hideCountryTooltip() {
  hoveredName.value = null
}

function updateCountryTooltipPosition(event: TooltipPointerEvent) {
  const frame = mapFrameRef.value

  if (!frame) {
    return
  }

  const frameRect = frame.getBoundingClientRect()
  setCountryTooltipPosition(event.clientX - frameRect.left, event.clientY - frameRect.top)
}

function updateCountryTooltipFromElement(target: EventTarget | null) {
  const frame = mapFrameRef.value

  if (!frame || !(target instanceof Element)) {
    return
  }

  const frameRect = frame.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()

  setCountryTooltipPosition(
    targetRect.left + targetRect.width / 2 - frameRect.left,
    targetRect.top + targetRect.height / 2 - frameRect.top,
  )
}

function setCountryTooltipPosition(x: number, y: number) {
  const frame = mapFrameRef.value

  if (!frame) {
    return
  }

  const frameRect = frame.getBoundingClientRect()
  const width = frameRect.width || frame.clientWidth
  const height = frameRect.height || frame.clientHeight
  const horizontalPadding = Math.min(132, Math.max(24, width / 2 - 18))

  tooltipPosition.x = clamp(x, horizontalPadding, Math.max(horizontalPadding, width - horizontalPadding))
  tooltipPosition.y = clamp(y, 74, Math.max(74, height - 18))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function hasPointerPosition(event: MouseEvent | FocusEvent): event is MouseEvent {
  return typeof (event as MouseEvent).clientX === "number" && typeof (event as MouseEvent).clientY === "number"
}

function geometryPath(geometry: WorldGeoJsonFeature["geometry"]) {
  if (!geometry?.coordinates) {
    return ""
  }

  if (geometry.type === "Polygon") {
    return polygonPath(geometry.coordinates)
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map((polygon) => polygonPath(polygon)).join(" ")
  }

  return ""
}

function polygonPath(polygon: unknown) {
  if (!Array.isArray(polygon)) {
    return ""
  }

  return polygon
    .map((ring) => ringPath(ring))
    .filter(Boolean)
    .join(" ")
}

function ringPath(ring: unknown) {
  if (!Array.isArray(ring)) {
    return ""
  }

  const points = ring.filter(isCoordinate)

  if (!points.length) {
    return ""
  }

  return `${points
    .map((point, index) => {
      const [x, y] = projectMapPoint(point)

      return `${index === 0 ? "M" : "L"}${formatMapNumber(x)} ${formatMapNumber(y)}`
    })
    .join(" ")} Z`
}

function geometryBounds(coordinatesList: unknown[]) {
  const bounds: MapBounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  for (const coordinates of coordinatesList) {
    visitCoordinates(coordinates, ([x, y]) => {
      const [projectedX, projectedY] = projectMapPoint([x, y])

      bounds.minX = Math.min(bounds.minX, projectedX)
      bounds.minY = Math.min(bounds.minY, projectedY)
      bounds.maxX = Math.max(bounds.maxX, projectedX)
      bounds.maxY = Math.max(bounds.maxY, projectedY)
    })
  }

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  }

  const padding = 8

  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  }
}

function visitCoordinates(value: unknown, callback: (coordinate: [number, number]) => void) {
  if (isCoordinate(value)) {
    callback(value)
    return
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      visitCoordinates(child, callback)
    }
  }
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number"
}

function projectMapPoint([x, y]: [number, number]): [number, number] {
  return [x, -y]
}

function formatMapNumber(value: number) {
  return Number(value.toFixed(2))
}
</script>

<template>
  <Card class="analytics-world-panel analytics-panel">
    <CardHeader class="analytics-world-header">
      <div>
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription v-if="summary">{{ summary }}</CardDescription>
      </div>

      <div v-if="selectedCountry" class="world-selected-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="world-selected h-auto px-0 py-0"
          @click="selectCountry(selectedCountry)"
        >
          <CountryFlag
            :code="selectedCountry.countryCode"
            :name="selectedCountry.countryName"
            class="world-selected-flag"
          />
          <span>
            <strong>{{ selectedCountry.countryName }}</strong>
            <small>{{ formatAnalyticsMoney(selectedCountry.revenue) }} / {{ formatAnalyticsShare(selectedCountry.share) }}</small>
          </span>
        </Button>

        <Button
          v-if="selectedCountry"
          type="button"
          variant="outline"
          size="sm"
          class="world-selected-clear h-auto px-0 py-0"
          aria-label="Clear country selection"
          @click="clearCountry"
        >
          <X class="size-4" aria-hidden="true" />
          <span>Clear</span>
        </Button>
      </div>
    </CardHeader>

    <CardContent class="analytics-world-body">
      <div
        ref="mapFrameRef"
        class="world-map-frame"
        @mouseleave="hideCountryTooltip"
      >
        <template v-if="drawableCountries.length">
          <svg
            class="world-map-svg"
            :viewBox="mapViewBox"
            role="img"
            aria-label="Country revenue map"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              v-for="country in drawableCountries"
              :key="country.mapName"
              :class="countryPathClass(country)"
              :style="countryPathStyle(country)"
              :d="country.path"
              tabindex="0"
              role="button"
              :aria-label="countryPathTitle(country)"
              @mouseenter="showCountryTooltip(country, $event)"
              @mousemove="updateCountryTooltipPosition"
              @mouseleave="hideCountryTooltip"
              @focus="showCountryTooltip(country, $event)"
              @blur="hideCountryTooltip"
              @click="handleCountryPathClick(country)"
              @keydown.enter.prevent="handleCountryPathClick(country)"
              @keydown.space.prevent="handleCountryPathClick(country)"
            />
          </svg>

          <div
            v-if="hoveredCountry"
            class="world-map-tooltip"
            :style="worldMapTooltipStyle"
            role="tooltip"
          >
            <span class="world-map-tooltip-heading">
              <CountryFlag
                :code="hoveredCountry.countryCode"
                :name="hoveredCountry.countryName"
                class="world-map-tooltip-flag"
              />
              <strong>{{ hoveredCountry.countryName }}</strong>
            </span>
            <span>{{ formatAnalyticsMoney(hoveredCountry.revenue) }} revenue</span>
            <span>{{ formatAnalyticsShare(hoveredCountry.share) }} of focused revenue</span>
            <span>{{ formatAnalyticsCompact(hoveredCountry.streams) }} plays + impressions</span>
          </div>
        </template>

        <AppEmptyState
          v-else
          compact
          icon="chart"
          title="No country map"
          :description="emptyText"
          class="border-0 bg-transparent shadow-none"
        />
      </div>

      <div class="world-country-list">
        <template v-if="rankedCountries.length">
          <Button
            v-for="country in rankedCountries.slice(0, 7)"
            :key="country.mapName"
            type="button"
            variant="ghost"
            size="sm"
            :class="['world-country-row h-auto px-0 py-0', country.mapName === selectedCountry?.mapName && 'active']"
            @click="selectCountry(country)"
          >
            <CountryFlag
              :code="country.countryCode"
              :name="country.countryName"
              class="world-country-flag"
            />
            <span class="world-country-copy">
              <strong>{{ country.countryName }}</strong>
              <small>{{ formatAnalyticsCompact(country.streams) }} plays + impressions</small>
            </span>
            <span class="world-country-value">
              <strong>{{ formatAnalyticsMoney(country.revenue) }}</strong>
              <small>{{ formatAnalyticsShare(country.share) }}</small>
            </span>
          </Button>
        </template>

        <AppEmptyState
          v-else
          compact
          icon="chart"
          title="No country data"
          :description="emptyText"
          class="border-0 bg-transparent shadow-none"
        />
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.analytics-world-panel {
  min-height: 100%;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

:global(.dark .analytics-world-panel) {
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.analytics-world-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.analytics-world-header :deep([data-slot="card-title"]) {
  margin: 0;
  color: var(--foreground);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
}

.analytics-world-header :deep([data-slot="card-description"]) {
  max-width: 620px;
  margin: 4px 0 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.world-selected {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 190px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--chart-1) 18%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--chart-1) 4%, transparent);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.world-selected-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.world-selected-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.world-selected-clear:hover {
  border-color: color-mix(in srgb, var(--primary) 22%, var(--border));
  color: var(--foreground);
}

.world-selected-flag,
.world-country-flag {
  width: 30px;
  color: var(--foreground);
  font-size: 22px;
  line-height: 1;
  text-align: center;
}

.world-selected strong,
.world-country-copy strong {
  display: block;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-selected small,
.world-country-copy small,
.world-country-value small {
  display: block;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.4;
}

.analytics-world-body {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(240px, 0.55fr);
  gap: 18px;
  align-items: stretch;
}

.world-map-frame {
  --world-country-base: rgb(138 139 132 / 16%);
  position: relative;
  min-width: 0;
  min-height: 310px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 46%, transparent);
  padding: 12px;
  display: grid;
  place-items: center;
}

.world-map-svg {
  width: 100%;
  height: clamp(300px, 34vw, 420px);
  overflow: visible;
}

.world-map-country {
  fill: var(--world-country-base);
  stroke: color-mix(in srgb, var(--background) 82%, transparent);
  stroke-width: 0.45;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
  transition:
    fill var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    stroke var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.world-map-country.has-revenue {
  fill: color-mix(in srgb, var(--chart-1) var(--country-fill, 42%), var(--world-country-base));
}

.world-map-country:hover,
.world-map-country:focus-visible,
.world-map-country.active {
  fill: var(--chart-1);
  stroke: var(--foreground);
  stroke-width: 0.8;
  outline: none;
}

.world-map-country:not(.has-revenue) {
  opacity: 0.68;
}

.world-map-tooltip {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 4px;
  width: max-content;
  min-width: 154px;
  max-width: min(240px, calc(100% - 24px));
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-radius: 10px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 14px 30px rgb(0 0 0 / 26%);
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 12px));
  backdrop-filter: blur(14px);
}

.world-map-tooltip::after {
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 10px;
  height: 10px;
  border-right: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  background: var(--popover);
  content: "";
  transform: translateX(-50%) rotate(45deg);
}

.world-map-tooltip-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.world-map-tooltip-flag {
  width: 22px;
  color: var(--foreground);
  font-size: 17px;
  line-height: 1;
  text-align: center;
}

.world-map-tooltip strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 680;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-map-tooltip span:not(.world-map-tooltip-heading) {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.25;
}

.world-country-list {
  display: grid;
  gap: 8px;
  align-content: start;
}

.world-country-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 54px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    background-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.world-country-row:hover,
.world-country-row.active {
  border-color: color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--priority) 5%, var(--surface-glass, transparent));
}

.world-country-row:active {
  transform: scale(0.99);
}

.world-country-copy {
  min-width: 0;
}

.world-country-value {
  display: grid;
  gap: 1px;
  justify-items: end;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 980px) {
  .analytics-world-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .analytics-world-panel {
    padding: 20px;
  }

  .analytics-world-header {
    display: grid;
  }

  .world-selected {
    width: 100%;
  }

  .world-selected-actions {
    justify-content: flex-start;
    width: 100%;
  }

  .world-map-frame {
    min-height: 280px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .world-country-row {
    transition: none;
  }
}
</style>
