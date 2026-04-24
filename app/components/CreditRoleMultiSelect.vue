<script setup lang="ts">
import {
  TRACK_CREDIT_ROLE_GROUPS,
  normalizeTrackCreditRoleCodes,
} from "~~/types/catalog"

const props = withDefaults(defineProps<{
  modelValue: string[]
  inputId: string
}>(), {
  modelValue: () => [],
})

const emit = defineEmits<{
  "update:modelValue": [value: string[]]
}>()

const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const search = ref("")

const selectedRoles = computed({
  get: () => normalizeTrackCreditRoleCodes(props.modelValue ?? []),
  set: (value: string[]) => {
    emit("update:modelValue", normalizeTrackCreditRoleCodes(value))
  },
})

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return TRACK_CREDIT_ROLE_GROUPS
  }

  return TRACK_CREDIT_ROLE_GROUPS
    .map((group) => ({
      ...group,
      roles: group.roles.filter((role) => {
        const normalizedRole = role.toLowerCase()
        const normalizedGroup = group.group.toLowerCase()
        return normalizedRole.includes(query) || normalizedGroup.includes(query)
      }),
    }))
    .filter((group) => group.roles.length)
})

const selectedSummary = computed(() => {
  if (!selectedRoles.value.length) {
    return "Search and select one or more roles."
  }

  if (selectedRoles.value.length <= 3) {
    return selectedRoles.value.join(", ")
  }

  return `${selectedRoles.value.slice(0, 3).join(", ")} +${selectedRoles.value.length - 3} more`
})

function focusSearchInput() {
  nextTick(() => {
    searchInput.value?.focus()
  })
}

function openMenu() {
  if (isOpen.value) {
    return
  }

  isOpen.value = true
  focusSearchInput()
}

function closeMenu() {
  isOpen.value = false
  search.value = ""
}

function toggleMenu() {
  if (isOpen.value) {
    closeMenu()
    return
  }

  openMenu()
}

function toggleRole(role: string) {
  const nextRoles = selectedRoles.value.includes(role)
    ? selectedRoles.value.filter((entry) => entry !== role)
    : [...selectedRoles.value, role]

  selectedRoles.value = nextRoles
}

function removeRole(role: string) {
  selectedRoles.value = selectedRoles.value.filter((entry) => entry !== role)
}

function clearRoles() {
  selectedRoles.value = []
  focusSearchInput()
}

function handleDocumentPointerDown(event: Event) {
  if (!isOpen.value || !root.value) {
    return
  }

  const target = event.target

  if (target instanceof Node && !root.value.contains(target)) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown)
})
</script>

<template>
  <div
    ref="root"
    class="credit-role-picker"
    :class="{ 'is-open': isOpen }"
    @keydown.esc.stop.prevent="closeMenu"
  >
    <button
      class="credit-role-picker__toggle"
      type="button"
      :aria-controls="`${inputId}-menu`"
      :aria-expanded="isOpen"
      @click="toggleMenu"
    >
      <div class="credit-role-picker__summary">
        <strong>{{ selectedRoles.length ? `${selectedRoles.length} roles selected` : "Select roles" }}</strong>
        <span class="detail-copy">{{ selectedSummary }}</span>
      </div>
      <span class="credit-role-picker__action">{{ isOpen ? "Close" : "Choose" }}</span>
    </button>

    <div v-if="selectedRoles.length" class="credit-role-picker__chips">
      <button
        v-for="role in selectedRoles"
        :key="role"
        class="credit-role-chip"
        type="button"
        @click="removeRole(role)"
      >
        <span>{{ role }}</span>
        <span aria-hidden="true">x</span>
      </button>
    </div>

    <div v-if="isOpen" :id="`${inputId}-menu`" class="credit-role-picker__menu">
      <div class="credit-role-picker__toolbar">
        <input
          :id="inputId"
          ref="searchInput"
          v-model="search"
          class="input"
          type="text"
          placeholder="Search credit roles"
        />
        <button
          v-if="selectedRoles.length"
          class="button button-secondary"
          type="button"
          @click="clearRoles"
        >
          Clear
        </button>
      </div>

      <p v-if="!filteredGroups.length" class="muted-copy">
        No credit roles match that search.
      </p>

      <div v-else class="credit-role-picker__groups">
        <div
          v-for="group in filteredGroups"
          :key="group.group"
          class="credit-role-picker__group"
        >
          <strong>{{ group.group }}</strong>

          <div class="credit-role-picker__options">
            <label
              v-for="role in group.roles"
              :key="`${inputId}-${role}`"
              class="credit-role-option"
              :class="{ 'is-selected': selectedRoles.includes(role) }"
            >
              <input
                :checked="selectedRoles.includes(role)"
                type="checkbox"
                @change="toggleRole(role)"
              />
              <span>{{ role }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
