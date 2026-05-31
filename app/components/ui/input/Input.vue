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
      'glass-field flex h-11 w-full min-w-0 rounded-xl border px-4 py-2 text-sm text-foreground ring-1 ring-transparent transition-[background-color,border-color,box-shadow,transform] duration-200 selection:bg-primary selection:text-primary-foreground file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:ring-primary/10 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
    @input="handleInput"
  >
</template>
