<script setup lang="ts">
import type { CalendarRootEmits, CalendarRootProps } from "radix-vue"
import type { DateValue } from "@internationalized/date"
import type { HTMLAttributes } from "vue"
import { getLocalTimeZone, today } from "@internationalized/date"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-vue-next"
import { NativeSelect } from "@/components/ui/native-select"
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
  useForwardProps,
} from "radix-vue"
import { computed, shallowRef, watch } from "vue"

type CalendarHighlightTone = "emergency" | "perfect" | "playlist"

interface CalendarDateHighlight {
  date: string
  tone: CalendarHighlightTone
}

const props = withDefaults(
  defineProps<CalendarRootProps & {
    class?: HTMLAttributes["class"]
    dateHighlights?: CalendarDateHighlight[]
  }>(),
  {
    fixedWeeks: true,
    weekStartsOn: 0,
    dateHighlights: () => [],
  },
)
const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = computed(() => {
  const {
    class: _,
    dateHighlights: _dateHighlights,
    defaultPlaceholder: _defaultPlaceholder,
    placeholder: _placeholder,
    ...delegated
  } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
const pageDate = shallowRef<DateValue>(resolveInitialPageDate())
const dateHighlightLookup = computed(() => {
  return new Map(props.dateHighlights.map((highlight) => [highlight.date, highlight.tone]))
})

const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2026, index, 1))

  return {
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(date),
    value: index + 1,
  }
})

const yearOptions = computed(() => {
  const currentYear = pageDate.value.year
  const minYear = props.minValue?.year ?? Math.min(currentYear - 100, today(getLocalTimeZone()).year - 100)
  const maxYear = props.maxValue?.year ?? Math.max(currentYear + 100, today(getLocalTimeZone()).year + 50)

  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index)
})

const selectedMonth = computed({
  get: () => String(pageDate.value.month),
  set: (value: string) => {
    updatePageDate(pageDate.value.set({ month: Number(value) }))
  },
})

const selectedYear = computed({
  get: () => String(pageDate.value.year),
  set: (value: string) => {
    updatePageDate(pageDate.value.set({ year: Number(value) }))
  },
})

watch(
  () => props.placeholder,
  (value) => {
    if (value) {
      pageDate.value = value
    }
  },
)

watch(
  () => [props.modelValue, props.defaultPlaceholder] as const,
  () => {
    if (!props.placeholder) {
      pageDate.value = resolveInitialPageDate()
    }
  },
)

function resolveInitialPageDate() {
  return props.placeholder
    ?? getModelDate(props.modelValue)
    ?? props.defaultPlaceholder
    ?? today(getLocalTimeZone())
}

function getModelDate(value: CalendarRootProps["modelValue"]) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function updatePageDate(value: DateValue) {
  pageDate.value = clampPageDate(value)
  emits("update:placeholder", pageDate.value)
}

function clampPageDate(value: DateValue) {
  if (props.minValue && value.compare(props.minValue) < 0) {
    return props.minValue
  }

  if (props.maxValue && value.compare(props.maxValue) > 0) {
    return props.maxValue
  }

  return value
}

function dateHighlightTone(value: DateValue) {
  return dateHighlightLookup.value.get(value.toString())
}

function dateHighlightClass(value: DateValue, dayIndex: number) {
  const tone = dateHighlightTone(value)

  if (!tone) {
    return undefined
  }

  const previousTone = dateHighlightTone(value.subtract({ days: 1 }))
  const nextTone = dateHighlightTone(value.add({ days: 1 }))
  const isRowStart = dayIndex === 0
  const isRowEnd = dayIndex === 6

  return [
    "calendar-date-band",
    `calendar-date-band-${tone}`,
    previousTone === tone && !isRowStart ? "calendar-date-band-joined-start" : "calendar-date-band-start",
    nextTone === tone && !isRowEnd ? "calendar-date-band-joined-end" : "calendar-date-band-end",
  ]
}

</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    v-bind="{ ...forwardedProps, ...$attrs }"
    :placeholder="pageDate"
    :class="cn('glass-menu rounded-xl p-3.5 text-popover-foreground', props.class)"
    @update:model-value="emits('update:modelValue', $event)"
    @update:placeholder="updatePageDate"
  >
    <CalendarHeader class="calendar-header mb-3 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1">
      <CalendarPrev
        class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-px hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 disabled:pointer-events-none disabled:cursor-default disabled:opacity-35"
      >
        <ChevronLeft class="size-4" aria-hidden="true" />
        <span class="sr-only">Previous month</span>
      </CalendarPrev>

      <CalendarHeading v-slot="{ headingValue }" class="flex min-w-0 items-center justify-center gap-2">
        <span class="sr-only">
        {{ headingValue }}
        </span>
        <NativeSelect
          v-model="selectedMonth"
          size="sm"
          class="min-w-0 flex-1"
          aria-label="Select month"
        >
          <option v-for="month in monthOptions" :key="month.value" :value="String(month.value)">
            {{ month.label }}
          </option>
        </NativeSelect>

        <NativeSelect
          v-model="selectedYear"
          size="sm"
          class="w-[5.75rem]"
          aria-label="Select year"
        >
          <option v-for="year in yearOptions" :key="year" :value="String(year)">
            {{ year }}
          </option>
        </NativeSelect>
      </CalendarHeading>

      <CalendarNext
        class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-px hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 disabled:pointer-events-none disabled:cursor-default disabled:opacity-35"
      >
        <ChevronRight class="size-4" aria-hidden="true" />
        <span class="sr-only">Next month</span>
      </CalendarNext>
    </CalendarHeader>

    <div class="grid gap-4 sm:grid-cols-[repeat(var(--calendar-months,1),minmax(0,1fr))]">
      <CalendarGrid
        v-for="month in grid"
        :key="month.value.toString()"
        class="w-full border-collapse space-y-1"
      >
        <CalendarGridHead>
          <CalendarGridRow class="mb-1 grid grid-cols-7">
            <CalendarHeadCell
              v-for="day in weekDays"
              :key="day"
              class="flex h-8 items-center justify-center rounded-md text-[0.72rem] font-medium text-muted-foreground"
            >
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>

        <CalendarGridBody class="grid gap-1">
          <CalendarGridRow
            v-for="(weekDates, weekIndex) in month.rows"
            :key="`week-${weekIndex}`"
            class="grid grid-cols-7 gap-1"
          >
            <CalendarCell
              v-for="(weekDate, dayIndex) in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
              :class="cn(
                'relative flex size-9 items-center justify-center p-0 text-center text-sm',
                dateHighlightClass(weekDate, dayIndex),
              )"
            >
              <CalendarCellTrigger
                as="button"
                type="button"
                :day="weekDate"
                :month="month.value"
                class="calendar-day-trigger inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-transparent text-sm font-medium ring-1 ring-transparent transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:scale-[0.96] data-[disabled]:pointer-events-none data-[disabled]:cursor-default data-[disabled]:opacity-35 data-[outside-view]:text-muted-foreground/45 data-[outside-visible-view]:text-muted-foreground/30 data-[selected]:border-primary data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:ring-primary/20 data-[selected]:hover:bg-primary data-[selected]:hover:text-primary-foreground data-[today]:border-primary/45 data-[today]:ring-primary/15 data-[unavailable]:cursor-not-allowed data-[unavailable]:text-muted-foreground data-[unavailable]:line-through data-[unavailable]:hover:translate-y-0 data-[unavailable]:hover:bg-transparent"
              >
                <template #default="{ dayValue }">
                  <span class="calendar-day-value">{{ dayValue }}</span>
                </template>
              </CalendarCellTrigger>
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>

<style scoped>
.calendar-date-band::before {
  position: absolute;
  z-index: 0;
  top: 0.62rem;
  bottom: 0.62rem;
  left: -0.25rem;
  right: -0.25rem;
  content: "";
  pointer-events: none;
}

.calendar-date-band-start::before {
  left: 0.12rem;
  border-bottom-left-radius: 999px;
  border-top-left-radius: 999px;
}

.calendar-date-band-end::before {
  right: 0.12rem;
  border-bottom-right-radius: 999px;
  border-top-right-radius: 999px;
}

.calendar-date-band-emergency::before {
  background: rgb(245 196 81 / 11%);
}

.calendar-date-band-perfect::before {
  background: rgb(30 215 96 / 9%);
}

.calendar-date-band-playlist::before {
  background: rgb(168 122 255 / 10%);
}

.calendar-day-trigger[data-selected] {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--primary) 24%, transparent);
}

.calendar-day-trigger[data-selected]:hover,
.calendar-day-trigger[data-selected]:focus-visible {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

.calendar-day-trigger[data-selected][data-today] {
  border-color: var(--primary);
}

.calendar-day-trigger[data-selected] .calendar-day-value {
  color: inherit;
  opacity: 1;
}

.calendar-date-band > :deep(.calendar-day-trigger) {
  position: relative;
  z-index: 1;
}
</style>
