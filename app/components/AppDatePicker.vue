<script setup lang="ts">
import type { DateValue } from "@internationalized/date"
import type { ComponentPublicInstance, HTMLAttributes } from "vue"
import { getLocalTimeZone, parseDate, today } from "@internationalized/date"
import { CalendarIcon } from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
  calendarLabel?: string
  class?: HTMLAttributes["class"]
}>(), {
  modelValue: "",
  disabled: false,
  required: false,
  placeholder: "Pick a date",
  calendarLabel: "Choose date",
})

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const timeZone = getLocalTimeZone()
const isInvalid = ref(false)
const triggerButton = ref<ComponentPublicInstance | HTMLElement | null>(null)

const selectedDate = computed(() => parseIsoDate(props.modelValue))
const defaultPlaceholder = computed(() => selectedDate.value ?? today(timeZone))
const displayValue = computed(() => {
  if (!selectedDate.value) {
    return props.placeholder
  }

  return formatDateLabel(selectedDate.value)
})

watch(
  () => props.modelValue,
  () => {
    isInvalid.value = false
  },
)

function parseIsoDate(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined
  }

  try {
    return parseDate(normalized)
  } catch {
    return undefined
  }
}

function formatDateValue(value: DateValue) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
}

function formatDateLabel(value: DateValue) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, value.day)))
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

function handleDateSelect(value: DateValue | undefined, close?: () => void) {
  emit("update:modelValue", value ? formatDateValue(value) : "")
  isInvalid.value = false
  close?.()
}

function clearDate(close?: () => void) {
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
          :data-has-value="selectedDate ? 'true' : 'false'"
          :class="cn(
            'app-picker__trigger glass-field h-11 w-full justify-start gap-3 rounded-xl border-input px-4 text-left font-normal ring-1 ring-transparent transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:ring-primary/10 focus-visible:border-primary/45 active:translate-y-0',
            isInvalid && 'border-destructive focus-visible:ring-destructive',
          )"
        >
          <CalendarIcon class="app-picker__icon size-4" aria-hidden="true" />
          <span class="app-picker__value min-w-0 truncate">{{ displayValue }}</span>
        </Button>
      </PopoverTrigger>
    </div>

    <PopoverContent v-if="open" align="start" class="w-auto p-0">
      <Calendar
        :model-value="selectedDate"
        :default-placeholder="defaultPlaceholder"
        :calendar-label="calendarLabel"
        initial-focus
        @update:model-value="handleDateSelect($event, close)"
      />
      <div v-if="!required && selectedDate" class="border-t border-border/80 p-2">
        <Button type="button" variant="ghost" size="sm" class="w-full justify-center" @click="clearDate(close)">
          Clear date
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

.app-picker__trigger {
  color: var(--muted-foreground) !important;
}

.app-picker__trigger[data-has-value="true"] {
  color: var(--foreground) !important;
}

.app-picker__value {
  color: currentColor;
  opacity: 1;
}

.app-picker__icon {
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
}

.app-picker__trigger[data-has-value="true"] .app-picker__icon {
  color: color-mix(in srgb, var(--foreground) 70%, var(--muted-foreground) 30%);
}
</style>
