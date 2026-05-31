<script setup lang="ts">
import { Check, ChevronDown } from "lucide-vue-next"
import {
  Comment,
  Fragment,
  Text,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  useSlots,
  type HTMLAttributes,
  type VNode,
} from "vue"
import { cn } from "@/lib/utils"
import CountryFlag from "~/components/CountryFlag.vue"
import DspLogo from "~/components/DspLogo.vue"
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue as SelectValuePrimitive,
  SelectViewport,
} from "radix-vue"

defineOptions({
  inheritAttrs: false,
})

type SelectValue = string | number | null
type NativeSelectSize = "default" | "sm"
type SelectContentSide = "top" | "right" | "bottom" | "left"
type SelectContentAlign = "start" | "center" | "end"
type SelectOptionVisual =
  | { kind: "country"; code?: string | null; label?: string | null }
  | { kind: "dsp"; logoKey?: string | null; name?: string | null; label?: string | null }
  | { kind: "cover"; imageUrl?: string | null; label?: string | null }

interface SelectOption {
  value: SelectValue
  nativeValue: string
  radixValue: string
  label: string
  disabled: boolean
  visual: SelectOptionVisual | null
}

const props = withDefaults(defineProps<{
  defaultValue?: SelectValue
  modelValue?: SelectValue
  modelModifiers?: {
    number?: boolean
  }
  class?: HTMLAttributes["class"]
  contentAlign?: SelectContentAlign
  contentClass?: HTMLAttributes["class"]
  contentSide?: SelectContentSide
  contentSideOffset?: number
  size?: NativeSelectSize
}>(), {
  contentAlign: "start",
  contentSide: "bottom",
  contentSideOffset: 6,
  size: "default",
})

const emit = defineEmits<{
  "update:modelValue": [value: SelectValue]
  change: [event: Event]
}>()

const attrs = useAttrs()
const slots = useSlots()
const selectElement = ref<HTMLSelectElement | null>(null)
const triggerElement = ref<HTMLElement | null>(null)
const wrapperElement = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const selectInstanceId = `native-select-${Math.random().toString(36).slice(2)}`
const nativeSelectOpenEvent = "naad:native-select-open"

const options = computed(() => normalizeOptions(slots.default?.() ?? []))
const nativeValue = computed(() => valueToNative(props.modelValue ?? props.defaultValue ?? ""))
const selectedOption = computed(() => options.value.find((entry) => entry.nativeValue === nativeValue.value) ?? null)
const radixValue = computed(() => selectedOption.value?.radixValue ?? nativeValue.value)
const selectedLabel = computed(() => selectedOption.value?.label ?? "Select option")
const isDisabled = computed(() => booleanAttr(attrs.disabled))
const isRequired = computed(() => booleanAttr(attrs.required))
const rootName = computed(() => typeof attrs.name === "string" ? attrs.name : undefined)
const rootAutocomplete = computed(() => typeof attrs.autocomplete === "string" ? attrs.autocomplete : undefined)
const triggerAttrs = computed(() => {
  const {
    autocomplete: _autocomplete,
    class: _class,
    disabled: _disabled,
    name: _name,
    onInvalid: _onInvalid,
    required: _required,
    style: _style,
    ...rest
  } = attrs

  return rest
})
const nativeSelectAttrs = computed(() => {
  const {
    class: _class,
    id: _id,
    style: _style,
    tabindex: _tabindex,
    ...rest
  } = attrs

  return rest
})

function valueToNative(value: SelectValue | undefined) {
  return value === null || value === undefined ? "" : String(value)
}

function booleanAttr(value: unknown) {
  return value !== undefined && value !== false && value !== "false"
}

function isDisabledOption(value: unknown) {
  return value !== undefined && value !== false
}

function normalizeVisual(value: unknown): SelectOptionVisual | null {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return null
  }

  const visual = value as SelectOptionVisual

  return visual.kind === "country" || visual.kind === "dsp" || visual.kind === "cover" ? visual : null
}

function textFromChildren(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child)
      }

      return textFromVNode(child as VNode)
    }).join("")
  }

  if (typeof children === "function") {
    return textFromChildren(children())
  }

  if (children && typeof children === "object" && "default" in children) {
    const defaultSlot = (children as { default?: () => unknown }).default
    return defaultSlot ? textFromChildren(defaultSlot()) : ""
  }

  return ""
}

function textFromVNode(node: VNode): string {
  if (node.type === Text) {
    return textFromChildren(node.children)
  }

  return textFromChildren(node.children)
}

function normalizeOptions(nodes: VNode[], accumulator: SelectOption[] = []) {
  for (const node of nodes) {
    if (!node || node.type === Comment) {
      continue
    }

    if (node.type === Fragment && Array.isArray(node.children)) {
      normalizeOptions(node.children as VNode[], accumulator)
      continue
    }

    const optionProps = (node.props ?? {}) as Record<string, unknown>
    const isNativeOption = typeof node.type === "string" && node.type.toLowerCase() === "option"
    const isOptionComponent = typeof node.type !== "string" && "value" in optionProps

    if (!isNativeOption && !isOptionComponent) {
      if (Array.isArray(node.children)) {
        normalizeOptions(node.children as VNode[], accumulator)
      } else if (node.children && typeof node.children === "object" && "default" in node.children) {
        const defaultSlot = (node.children as { default?: () => VNode[] }).default
        normalizeOptions(defaultSlot?.() ?? [], accumulator)
      }
      continue
    }

    const rawLabel = textFromChildren(node.children).trim()
    const rawValue = optionProps.value as SelectValue | undefined
    const value = rawValue === undefined ? rawLabel : rawValue
    const nativeOptionValue = valueToNative(value)
    const label = rawLabel || String(optionProps.label ?? nativeOptionValue)
    const radixOptionValue = nativeOptionValue === ""
      ? `__naad_native_select_empty_${accumulator.length}__`
      : nativeOptionValue

    accumulator.push({
      value,
      nativeValue: nativeOptionValue,
      radixValue: radixOptionValue,
      label,
      disabled: isDisabledOption(optionProps.disabled),
      visual: normalizeVisual(optionProps.visual),
    })
  }

  return accumulator
}

function coerceSelectedValue(value: string): SelectValue {
  const option = options.value.find((entry) => entry.nativeValue === value)

  if (option) {
    if (props.modelModifiers?.number && typeof option.value === "string" && option.value !== "") {
      const numberValue = Number(option.value)
      return Number.isNaN(numberValue) ? option.value : numberValue
    }

    return option.value
  }

  if (props.modelModifiers?.number && value !== "") {
    const numberValue = Number(value)
    return Number.isNaN(numberValue) ? value : numberValue
  }

  return value
}

function emitNativeChange(nextNativeValue: string) {
  nextTick(() => {
    const nativeSelect = selectElement.value

    if (!nativeSelect) {
      emit("change", new Event("change", { bubbles: true }))
      return
    }

    nativeSelect.value = nextNativeValue
    const event = new Event("change", { bubbles: true })
    nativeSelect.dispatchEvent(event)
    emit("change", event)
  })
}

function handleValueChange(value: string) {
  const option = options.value.find((entry) => entry.radixValue === value)
  const nextNativeValue = option?.nativeValue ?? value

  emit("update:modelValue", coerceSelectedValue(nextNativeValue))
  emitNativeChange(nextNativeValue)
  isOpen.value = false
}

function handleOpenChange(open: boolean) {
  isOpen.value = open

  if (open && import.meta.client) {
    window.dispatchEvent(new CustomEvent(nativeSelectOpenEvent, {
      detail: { id: selectInstanceId },
    }))
  }
}

function handleOtherSelectOpen(event: Event) {
  const detail = (event as CustomEvent<{ id?: string }>).detail

  if (detail?.id !== selectInstanceId) {
    isOpen.value = false
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isOpen.value || !(event.target instanceof Node)) {
    return
  }

  if (wrapperElement.value?.contains(event.target)) {
    return
  }

  if (event.target instanceof Element && event.target.closest(".native-select-content")) {
    return
  }

  isOpen.value = false
}

function focus(options?: FocusOptions) {
  triggerElement.value?.focus(options)
}

function blur() {
  triggerElement.value?.blur()
}

function dispatchEvent(event: Event) {
  return selectElement.value?.dispatchEvent(event) ?? false
}

defineExpose({
  blur,
  dispatchEvent,
  focus,
  selectElement,
  triggerElement,
})

onMounted(() => {
  window.addEventListener(nativeSelectOpenEvent, handleOtherSelectOpen)
  document.addEventListener("pointerdown", handleDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener(nativeSelectOpenEvent, handleOtherSelectOpen)
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true)
})
</script>

<template>
  <div
    ref="wrapperElement"
    :class="cn(
      'group/native-select relative w-full min-w-0 has-[select:disabled]:opacity-50',
      props.class,
    )"
    data-slot="native-select-wrapper"
    :data-size="size"
  >
    <SelectRoot
      :model-value="radixValue"
      :open="isOpen"
      :disabled="isDisabled"
      @update:model-value="handleValueChange"
      @update:open="handleOpenChange"
    >
      <SelectTrigger
        v-bind="triggerAttrs"
        ref="triggerElement"
        data-slot="native-select"
        :data-size="size"
        :disabled="isDisabled"
        :aria-required="isRequired || undefined"
        :class="cn(
          'relative flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 pr-9 text-left text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-primary/25 hover:bg-accent/25 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-8 data-[size=sm]:px-2 data-[size=sm]:py-1 data-[size=sm]:pr-8 [&>span]:line-clamp-1',
        )"
      >
        <SelectValuePrimitive as-child>
          <span class="native-select-value">
            <CountryFlag
              v-if="selectedOption?.visual?.kind === 'country'"
              :code="selectedOption.visual.code || selectedOption.nativeValue"
              :label="selectedOption.visual.label || selectedOption.label"
              show-label
            />
            <span v-else-if="selectedOption?.visual?.kind === 'dsp'" class="native-select-dsp-value">
              <DspLogo
                :logo-key="selectedOption.visual.logoKey"
                :name="selectedOption.visual.name || selectedOption.label"
                :label="selectedOption.visual.label || selectedOption.label"
                size="xs"
                :interactive="false"
              />
              <span class="sr-only">{{ selectedOption.label }}</span>
            </span>
            <span v-else-if="selectedOption?.visual?.kind === 'cover'" class="native-select-cover-value">
              <span class="native-select-cover-frame">
                <img
                  v-if="selectedOption.visual.imageUrl"
                  :src="selectedOption.visual.imageUrl"
                  :alt="selectedOption.visual.label || selectedOption.label"
                  loading="lazy"
                  decoding="async"
                >
                <span v-else>{{ selectedOption.label.slice(0, 1).toUpperCase() || "R" }}</span>
              </span>
              <span class="native-select-option-label">{{ selectedOption.label }}</span>
            </span>
            <span v-else class="native-select-option-label">{{ selectedLabel }}</span>
          </span>
        </SelectValuePrimitive>
        <ChevronDown
          class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-50"
          aria-hidden="true"
        />
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          position="popper"
          :align="contentAlign"
          :body-lock="false"
          :side="contentSide"
          :side-offset="contentSideOffset"
          :class="cn(
            'native-select-content relative z-[70] max-h-96 min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none will-change-[opacity,transform] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            contentClass,
          )"
        >
          <SelectViewport class="native-select-viewport max-h-[min(22rem,var(--radix-select-content-available-height),calc(100vh-24px))] min-w-0 overflow-y-auto">
            <SelectItem
              v-for="option in options"
              :key="`${option.radixValue}:${option.label}`"
              :value="option.radixValue"
              :disabled="option.disabled"
              :text-value="option.label"
              class="native-select-item relative flex w-full cursor-default select-none items-center rounded-md py-2 pl-8 pr-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              <span class="absolute left-2 flex size-3.5 items-center justify-center">
                <SelectItemIndicator>
                  <Check class="size-4" aria-hidden="true" />
                </SelectItemIndicator>
              </span>
              <SelectItemText class="min-w-0 flex-1">
                <span class="native-select-option-content">
                  <CountryFlag
                    v-if="option.visual?.kind === 'country'"
                    :code="option.visual.code || option.nativeValue"
                    :label="option.visual.label || option.label"
                    show-label
                  />
                  <span v-else-if="option.visual?.kind === 'dsp'" class="native-select-dsp-value">
                    <DspLogo
                      :logo-key="option.visual.logoKey"
                      :name="option.visual.name || option.label"
                      :label="option.visual.label || option.label"
                      size="xs"
                      :interactive="false"
                    />
                    <span class="sr-only">{{ option.label }}</span>
                  </span>
                  <span v-else-if="option.visual?.kind === 'cover'" class="native-select-cover-value">
                    <span class="native-select-cover-frame">
                      <img
                        v-if="option.visual.imageUrl"
                        :src="option.visual.imageUrl"
                        :alt="option.visual.label || option.label"
                        loading="lazy"
                        decoding="async"
                      >
                      <span v-else>{{ option.label.slice(0, 1).toUpperCase() || "R" }}</span>
                    </span>
                    <span class="native-select-option-label">{{ option.label }}</span>
                  </span>
                  <span v-else class="native-select-option-label">{{ option.label }}</span>
                </span>
              </SelectItemText>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

    <select
      v-bind="nativeSelectAttrs"
      ref="selectElement"
      class="sr-only pointer-events-none"
      data-slot="native-select-sentinel"
      :value="nativeValue"
      :disabled="isDisabled"
      :required="isRequired"
      :name="rootName"
      :autocomplete="rootAutocomplete"
      tabindex="-1"
      aria-hidden="true"
    >
      <option
        v-for="option in options"
        :key="`${option.nativeValue}:${option.label}:sentinel`"
        :value="option.nativeValue"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.native-select-content {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, var(--foreground) 10%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover));
  box-shadow: var(--shadow-lg), inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
}

.native-select-viewport {
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.native-select-value,
.native-select-option-content,
.native-select-dsp-value {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
}

.native-select-value {
  flex: 1 1 auto;
  overflow: hidden;
}

.native-select-option-content {
  width: 100%;
}

.native-select-dsp-value {
  overflow: hidden;
}

.native-select-cover-value {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
  overflow: hidden;
}

.native-select-cover-frame {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 60%, transparent);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 700;
}

.native-select-cover-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.native-select-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.native-select-item {
  min-height: 36px;
  color: var(--popover-foreground);
}

.native-select-item[data-highlighted],
.native-select-item:focus {
  background: color-mix(in srgb, var(--primary) 13%, var(--accent));
  color: var(--foreground);
}

.native-select-item[data-state="checked"] {
  background: color-mix(in srgb, var(--primary) 9%, transparent);
  color: var(--foreground);
}

.native-select-item > span:first-child {
  color: var(--primary);
}
</style>
