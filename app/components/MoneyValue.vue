<script setup lang="ts">
import { useCountUp } from "~/composables/useCountUp"

const props = defineProps<{
  value?: string | number | null
  size?: "sm" | "md" | "lg" | "xl"
  animate?: boolean
  animateDelay?: number
}>()

const numericTarget = computed(() => Number(props.value ?? 0))
const animatedValue = useCountUp(numericTarget, {
  duration: 900,
  delay: props.animateDelay ?? 0,
})

const displayValue = computed(() => {
  const raw = props.animate ? animatedValue.value : Number(props.value ?? 0)
  const formatted = raw.toFixed(2)
  const [integer, decimal] = formatted.split(".")
  return { integer, decimal }
})
</script>

<template>
  <span :class="['money-value', size ? `money-value-${size}` : '']" data-money>
    <slot>
      <span class="money-currency">$</span><span class="money-integer">{{ displayValue.integer }}</span><span class="money-decimal">.{{ displayValue.decimal }}</span>
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
}

/* Design Engineering: optical alignment — currency and decimal are de-emphasized */
.money-currency {
  font-size: 0.55em;
  vertical-align: super;
  opacity: 0.6;
  margin-right: 1px;
  font-weight: 500;
}

.money-decimal {
  font-size: 0.55em;
  vertical-align: super;
  opacity: 0.6;
  font-weight: 500;
}

.money-integer {
  font-size: 1em;
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
