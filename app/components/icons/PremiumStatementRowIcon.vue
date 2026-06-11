<script setup lang="ts">
defineProps<{
  variant: "credit" | "due" | "payout" | "adjustment"
}>()
</script>

<template>
  <svg
    class="premium-statement-icon"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <template v-if="variant === 'credit'">
      <path class="icon-stroke" d="M4.9 10.15h18.2" />
      <path class="icon-stroke" d="M7.7 7.2h12.6a2.8 2.8 0 0 1 2.8 2.8v8a2.8 2.8 0 0 1-2.8 2.8H7.7A2.8 2.8 0 0 1 4.9 18v-8a2.8 2.8 0 0 1 2.8-2.8Z" />
      <path class="icon-stroke-muted" d="M8.7 16.2h5.25" />
      <path class="icon-stroke-muted" d="M8.7 18.25h3.45" />
      <path class="icon-stroke" d="m18 16.95 2.1-2.1m0 0v2.1m0-2.1H18" />
    </template>

    <template v-else-if="variant === 'due'">
      <path class="icon-stroke" d="M7.55 5.95h12.9v16.1l-2.15-1.1-2.15 1.1-2.15-1.1-2.15 1.1-2.15-1.1-2.15 1.1V5.95Z" />
      <path class="icon-stroke-muted" d="M10.25 10.45h7.5" />
      <path class="icon-stroke-muted" d="M10.25 14h5.75" />
      <path class="icon-stroke" d="M16.85 17.45h3.1" />
    </template>

    <template v-else-if="variant === 'payout'">
      <path class="icon-stroke" d="M4.9 10.15h18.2" />
      <path class="icon-stroke" d="M7.7 7.2h12.6a2.8 2.8 0 0 1 2.8 2.8v8a2.8 2.8 0 0 1-2.8 2.8H7.7A2.8 2.8 0 0 1 4.9 18v-8a2.8 2.8 0 0 1 2.8-2.8Z" />
      <path class="icon-stroke-muted" d="M8.75 16.35h5" />
      <path class="icon-stroke" d="M16.45 17.1h4.1" />
      <path class="icon-stroke" d="m18.45 15.1 2.1 2-2.1 2" />
    </template>

    <template v-else>
      <path class="icon-stroke" d="M6.15 8.2h15.7v11.6H6.15V8.2Z" />
      <path class="icon-stroke-muted" d="M9 11.8h10" />
      <path class="icon-stroke-muted" d="M9 14.2h10" />
      <path class="icon-stroke" d="M10.9 17h2.55" />
      <path class="icon-stroke" d="M16.1 17h1.15" />
    </template>
  </svg>
</template>

<style scoped>
.premium-statement-icon {
  display: block;
  width: 24px;
  height: 24px;
  overflow: visible;
}

.icon-stroke,
.icon-stroke-muted {
  stroke: currentColor;
  stroke-width: 1.85;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.icon-stroke-muted {
  opacity: 0.54;
}
</style>
