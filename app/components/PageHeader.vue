<script setup lang="ts">
// Signature page-header choreography: eyebrow fades up, the Fraunces title
// rises through a SplitText line mask, description and actions follow.
// All four use trigger:'mount' so pages calling useRevealPage({ ready })
// hold them until the page's first data lands. `:reveal="false"` opts out.
const props = withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
    reveal?: boolean
  }>(),
  {
    eyebrow: undefined,
    description: undefined,
    reveal: true,
  },
)

const revealDisabled = computed(() => !props.reveal)
</script>

<template>
  <div class="page-header">
    <div class="page-header-text">
      <p
        v-if="eyebrow"
        v-reveal="{ trigger: 'mount', y: 12, duration: 0.6, disabled: revealDisabled }"
        class="page-header-eyebrow"
      >
        {{ eyebrow }}
      </p>
      <h1
        v-reveal="{ trigger: 'mount', split: 'lines', duration: 1, delay: 0.05, disabled: revealDisabled }"
        class="page-header-title"
      >
        {{ title }}
      </h1>
      <p
        v-if="description"
        v-reveal="{ trigger: 'mount', y: 14, duration: 0.7, delay: 0.16, disabled: revealDisabled }"
        class="page-header-description"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      v-reveal="{ trigger: 'mount', y: 14, duration: 0.7, delay: 0.22, disabled: revealDisabled }"
      class="page-header-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  padding-bottom: 24px;
}

@media (min-width: 768px) {
  .page-header {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
}

.page-header-text {
  display: grid;
  gap: 4px;
  width: min(100%, 920px);
  min-width: 0;
  max-width: 100%;
}

.page-header-eyebrow {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.page-header-title {
  font-family: var(--font-app-display);
  font-size: 29px;
  font-weight: 560;
  color: var(--foreground);
  letter-spacing: -0.01em;
  margin: 0;
  /* Design Engineering: balanced wrapping for headings */
  text-wrap: balance;
  overflow-wrap: anywhere;
  line-height: 1.15;
}

@media (min-width: 768px) {
  .page-header-title {
    font-size: 33px;
  }
}

.page-header-description {
  font-size: 14px;
  color: var(--muted-foreground);
  line-height: 1.6;
  margin: 0;
  min-width: 0;
  max-width: 640px;
  overflow-wrap: anywhere;
  /* Design Engineering: pretty wrapping for body text */
  text-wrap: pretty;
}

.page-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  /* Design Engineering: prevent actions from being crushed on narrow viewports */
  flex-shrink: 0;
}
</style>
