<script setup lang="ts">
import NumberFlow from "@number-flow/vue"

const props = defineProps<{
  value?: string | number | null
  size?: "sm" | "md" | "lg" | "xl"
  animate?: boolean
  animateDelay?: number
}>()

const numericTarget = computed(() => Number(props.value ?? 0))

/* Animated figures start at 0 and roll up after mount (odometer style).
   SSR and non-animated contexts render the final value statically. */
const shownValue = ref(props.animate ? 0 : numericTarget.value)

onMounted(() => {
  if (props.animate) {
    window.setTimeout(() => {
      shownValue.value = numericTarget.value
    }, props.animateDelay ?? 0)
  }
})

watch(numericTarget, (next) => {
  shownValue.value = next
})

const rollingInteger = computed(() => Math.trunc(shownValue.value))
const rollingDecimal = computed(() => Math.round(Math.abs(shownValue.value % 1) * 100) % 100)

const displayValue = computed(() => {
  const formatted = numericTarget.value.toFixed(2)
  const [integer, decimal] = formatted.split(".")
  return { integer, decimal }
})
</script>

<template>
  <span :class="['money-value', size ? `money-value-${size}` : '']" data-money>
    <slot>
      <span class="money-currency">$</span><template v-if="animate"><ClientOnly>
        <NumberFlow
          class="money-integer"
          :value="rollingInteger"
          :format="{ useGrouping: false, maximumFractionDigits: 0 }"
        /><span class="money-decimal">.<NumberFlow
          :value="rollingDecimal"
          :format="{ minimumIntegerDigits: 2, useGrouping: false, maximumFractionDigits: 0 }"
        /></span>
        <template #fallback>
          <span class="money-integer">{{ displayValue.integer }}</span><span class="money-decimal">.{{ displayValue.decimal }}</span>
        </template>
      </ClientOnly></template>
      <template v-else>
        <span class="money-integer">{{ displayValue.integer }}</span><span class="money-decimal">.{{ displayValue.decimal }}</span>
      </template>
    </slot>
  </span>
</template>

<style scoped>
.money-value {
  font-weight: 600;
  /* Design Engineering: tabular-nums for perfect column alignment in tables */
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  color: var(--foreground);
  letter-spacing: 0;
  /* Design Engineering: ensure right-alignment when used in table cells */
  text-align: inherit;
  line-height: 1.2;
  position: relative;
}

/* Design Engineering: optical alignment — currency and decimal are de-emphasized */
.money-currency {
  font-size: 0.55em;
  vertical-align: super;
  opacity: 0.6;
  margin-right: 1px;
  font-weight: 500;
  transition: opacity var(--duration-fast, 150ms) var(--ease-out);
}

.money-decimal {
  font-size: 0.55em;
  vertical-align: super;
  opacity: 0.6;
  font-weight: 500;
  transition: opacity var(--duration-fast, 150ms) var(--ease-out);
}

.money-integer {
  font-size: 1em;
}

/* Micro-interaction: subtle highlight on value change */
.money-value::after {
  content: "";
  position: absolute;
  inset: -2px -4px;
  background: radial-gradient(circle, color-mix(in srgb, var(--priority) 12%, transparent), transparent 70%);
  opacity: 0;
  pointer-events: none;
  border-radius: 4px;
  transition: opacity var(--duration-moderate, 300ms) var(--ease-out);
}

.money-value.updating::after {
  opacity: 1;
  animation: money-pulse 0.8s ease-out;
}

@keyframes money-pulse {
  0% { opacity: 0; transform: scale(0.95); }
  30% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0; transform: scale(1); }
}

/* Size variants */
.money-value-sm {
  font-size: 18px;
}

.money-value-md {
  font-size: 24px;
}

.money-value-lg {
  font-size: 32px;
}

.money-value-xl {
  font-size: clamp(32px, 4.5vw, 46px);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1;
}
</style>
