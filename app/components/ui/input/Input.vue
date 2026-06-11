<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { computed, ref, useAttrs } from 'vue'

const props = defineProps<{
  defaultValue?: string | number | null
  modelValue?: string | number | null
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number | null): void
}>()

defineOptions({
  inheritAttrs: false,
})

const attrs = useAttrs()
const inputElement = ref<HTMLInputElement | null>(null)

const inputType = computed(() => String(attrs.type ?? 'text'))
const isFileInput = computed(() => inputType.value === 'file')
const isCheckableInput = computed(() => inputType.value === 'checkbox' || inputType.value === 'radio')
const isTemporalInput = computed(() => ['date', 'datetime-local', 'month', 'time', 'week'].includes(inputType.value))
const hasControlledValue = computed(() => props.modelValue !== undefined)
const fallbackValue = computed(() => props.defaultValue ?? attrs.value ?? '')
const inputValue = computed(() => (hasControlledValue.value ? props.modelValue ?? '' : fallbackValue.value))
const shouldBindValue = computed(() => {
  if (isFileInput.value) {
    return false
  }

  return !isCheckableInput.value || hasControlledValue.value || props.defaultValue !== undefined || attrs.value !== undefined
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emits('update:modelValue', target?.value ?? null)
}

function focus(options?: FocusOptions) {
  inputElement.value?.focus(options)
}

function blur() {
  inputElement.value?.blur()
}

function select() {
  inputElement.value?.select()
}

defineExpose({
  blur,
  focus,
  inputElement,
  select,
})
</script>

<template>
  <input
    v-bind="attrs"
    ref="inputElement"
    :value="shouldBindValue ? inputValue : undefined"
    :class="cn(
      'surface-field glass-field flex h-11 w-full min-w-0 rounded-xl border px-4 py-2 text-sm text-foreground ring-1 ring-transparent transition-[background-color,border-color,box-shadow,transform] duration-200 selection:bg-primary selection:text-primary-foreground file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:ring-primary/10 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50',
      isTemporalInput && 'app-temporal-input',
      props.class,
    )"
    @input="handleInput"
  >
</template>

<style scoped>
.app-temporal-input {
  color: var(--foreground);
  color-scheme: light;
}

:global(.dark) .app-temporal-input {
  color-scheme: dark;
}

.app-temporal-input::-webkit-datetime-edit,
.app-temporal-input::-webkit-datetime-edit-fields-wrapper,
.app-temporal-input::-webkit-datetime-edit-text,
.app-temporal-input::-webkit-datetime-edit-month-field,
.app-temporal-input::-webkit-datetime-edit-day-field,
.app-temporal-input::-webkit-datetime-edit-year-field,
.app-temporal-input::-webkit-datetime-edit-hour-field,
.app-temporal-input::-webkit-datetime-edit-minute-field,
.app-temporal-input::-webkit-datetime-edit-ampm-field {
  color: var(--foreground);
  opacity: 1;
}

.app-temporal-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.78;
}

:global(.dark) .app-temporal-input::-webkit-calendar-picker-indicator {
  filter: invert(1) brightness(1.12);
}
</style>
