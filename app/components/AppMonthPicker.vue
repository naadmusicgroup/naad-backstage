<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from "vue"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const props = withDefaults(defineProps<{
  modelValue?: string | null
  id?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  class?: HTMLAttributes["class"]
}>(), {
  modelValue: "",
  disabled: false,
  required: false,
  placeholder: "Pick a month",
})

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const isInvalid = ref(false)
const triggerButton = ref<ComponentPublicInstance | HTMLElement | null>(null)
const visibleYear = ref(parseMonthValue(props.modelValue)?.year ?? new Date().getUTCFullYear())

const months = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
]

const selectedMonth = computed(() => parseMonthValue(props.modelValue))
const displayValue = computed(() => selectedMonth.value ? formatMonthLabel(selectedMonth.value) : props.placeholder)

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseMonthValue(value)

    if (parsed) {
      visibleYear.value = parsed.year
    }

    isInvalid.value = false
  },
)

function parseMonthValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  const match = /^(\d{4})-(\d{2})$/.exec(normalized)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return { year, month }
}

function monthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function formatMonthLabel(value: { year: number, month: number }) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, 1)))
}

function focusTrigger() {
  const target = triggerButton.value

  if (!target) {
    return
  }

  if (target instanceof HTMLElement) {
    target.focus()
    return
  }

  target.$el?.focus?.()
}

function selectMonth(month: number, close?: () => void) {
  emit("update:modelValue", monthValue(visibleYear.value, month))
  isInvalid.value = false
  close?.()
}

function clearMonth(close?: () => void) {
  emit("update:modelValue", "")
  isInvalid.value = false
  close?.()
}

function handleInvalid(event: Event) {
  event.preventDefault()
  isInvalid.value = true
  nextTick(focusTrigger)
}
</script>

<template>
  <Popover v-slot="{ close, open }">
    <div :class="cn('app-picker relative min-w-0', props.class)">
      <Input
        class="app-picker__native"
        :value="modelValue || ''"
        :required="required"
        :disabled="disabled"
        tabindex="-1"
        aria-hidden="true"
        @invalid="handleInvalid"
      />

      <PopoverTrigger as-child>
        <Button
          :id="id"
          ref="triggerButton"
          type="button"
          variant="outline"
          :disabled="disabled"
          :aria-invalid="isInvalid || undefined"
          :class="cn(
            'glass-field h-11 w-full justify-start gap-3 rounded-xl border-input px-4 text-left font-normal ring-1 ring-transparent transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:ring-primary/10 focus-visible:border-primary/45 active:translate-y-0',
            !selectedMonth && 'text-muted-foreground',
            isInvalid && 'border-destructive focus-visible:ring-destructive',
          )"
        >
          <CalendarIcon class="size-4 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ displayValue }}</span>
        </Button>
      </PopoverTrigger>
    </div>

    <PopoverContent v-if="open" align="start" class="w-[min(22rem,calc(100vw-2rem))] p-3.5">
      <div class="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1">
        <Button type="button" variant="ghost" size="icon" class="size-8 rounded-lg hover:-translate-y-px" @click="visibleYear -= 1">
          <ChevronLeft class="size-4" aria-hidden="true" />
          <span class="sr-only">Previous year</span>
        </Button>
        <strong class="min-w-20 rounded-lg px-3 py-1.5 text-center text-sm font-semibold tabular-nums tracking-normal">{{ visibleYear }}</strong>
        <Button type="button" variant="ghost" size="icon" class="size-8 rounded-lg hover:-translate-y-px" @click="visibleYear += 1">
          <ChevronRight class="size-4" aria-hidden="true" />
          <span class="sr-only">Next year</span>
        </Button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <Button
          v-for="month in months"
          :key="month.value"
          type="button"
          variant="ghost"
          size="sm"
          :class="cn(
            'h-10 cursor-pointer rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--surface-glass)_72%,transparent)] px-3 text-sm font-medium ring-1 ring-transparent transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-accent hover:ring-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:scale-[0.98]',
            selectedMonth?.year === visibleYear && selectedMonth?.month === month.value
              ? 'border-primary bg-primary text-primary-foreground ring-primary/20 hover:bg-primary hover:text-primary-foreground'
              : 'text-foreground',
          )"
          @click="selectMonth(month.value, close)"
        >
          {{ month.label }}
        </Button>
      </div>

      <div v-if="!required && selectedMonth" class="mt-3 border-t border-border/80 pt-2">
        <Button type="button" variant="ghost" size="sm" class="w-full justify-center" @click="clearMonth(close)">
          Clear month
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.app-picker__native {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
