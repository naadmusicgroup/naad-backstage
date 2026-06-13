<script setup lang="ts">
// Fixed, CSS-only stage-light field behind the dashboard. Color temperature
// follows local time of day ("the venue's house lights"): warmer through the
// morning, deepest gold at night. Zero per-frame JS — intensity is a single
// CSS variable resolved once per mount/activation.
const props = withDefaults(
  defineProps<{
    intensity?: number
  }>(),
  {
    intensity: 1,
  },
)

const timeIntensity = ref(1)

function resolveTimeIntensity() {
  const hour = new Date().getHours()

  // Night (20–05): full gold. Day (10–16): calmest. Shoulders blend between.
  if (hour >= 20 || hour < 5) {
    timeIntensity.value = 1.25
  } else if (hour >= 10 && hour < 16) {
    timeIntensity.value = 0.7
  } else {
    timeIntensity.value = 1
  }
}

const ambientStyle = computed(() => ({
  "--ambient-intensity": String(props.intensity * timeIntensity.value),
}))

onMounted(resolveTimeIntensity)
onActivated(resolveTimeIntensity)
</script>

<template>
  <div class="ambient-backdrop" :style="ambientStyle" aria-hidden="true" />
</template>
