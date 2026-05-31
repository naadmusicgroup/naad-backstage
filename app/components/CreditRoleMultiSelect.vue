<script setup lang="ts">
import {
  TRACK_CREDIT_ROLE_GROUPS,
  TRACK_CREDIT_ROLE_OPTIONS,
  normalizeTrackCreditRoleCodes,
} from "~~/types/catalog"

type CreditRoleGroup = {
  group: string
  roles: readonly string[]
}

const props = withDefaults(defineProps<{
  modelValue: string[]
  inputId: string
  roleGroups?: readonly CreditRoleGroup[]
}>(), {
  modelValue: () => [],
  roleGroups: () => TRACK_CREDIT_ROLE_GROUPS,
})

const emit = defineEmits<{
  "update:modelValue": [value: string[]]
}>()

const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const search = ref("")

const roleGroups = computed(() => props.roleGroups?.length ? props.roleGroups : TRACK_CREDIT_ROLE_GROUPS)
const roleOptions = computed(() => roleGroups.value.flatMap((group) => [...group.roles]))

const selectedRoles = computed({
  get: () => normalizeTrackCreditRoleCodes(
    props.modelValue ?? [],
    roleOptions.value.length ? roleOptions.value : TRACK_CREDIT_ROLE_OPTIONS,
  ),
  set: (value: string[]) => {
    emit(
      "update:modelValue",
      normalizeTrackCreditRoleCodes(
        value,
        roleOptions.value.length ? roleOptions.value : TRACK_CREDIT_ROLE_OPTIONS,
      ),
    )
  },
})

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return roleGroups.value
  }

  return roleGroups.value
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

<style scoped>
.credit-role-picker {
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 0;
}

.credit-role-picker__toggle {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  padding: 8px 12px;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease;
}

.credit-role-picker.is-open .credit-role-picker__toggle {
  border-color: var(--ring);
  background: var(--accent);
  color: var(--accent-foreground);
}

.credit-role-picker__summary {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.credit-role-picker__summary strong,
.credit-role-picker__summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-role-picker__summary strong {
  font-size: 13px;
  font-weight: 720;
}

.credit-role-picker__action {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--secondary);
  color: var(--secondary-foreground);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.credit-role-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.credit-role-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 32px;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--secondary);
  color: var(--foreground);
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 650;
}

.credit-role-chip span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-role-picker__menu {
  position: absolute;
  z-index: 70;
  top: calc(100% + 8px);
  left: 0;
  display: grid;
  width: min(520px, 100%);
  max-height: min(420px, calc(100vh - 140px));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-md);
}

.credit-role-picker__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  padding: 10px;
}

.credit-role-picker__toolbar .button {
  min-height: 40px;
}

.credit-role-picker__groups {
  display: grid;
  gap: 10px;
  overflow-y: auto;
  padding: 12px;
}

.credit-role-picker__group {
  display: grid;
  gap: 8px;
}

.credit-role-picker__group > strong {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.credit-role-picker__options {
  display: grid;
  gap: 6px;
}

.credit-role-option {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 38px;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--foreground);
  font-size: 13px;
}

.credit-role-option:hover,
.credit-role-option:focus-within,
.credit-role-option.is-selected {
  border-color: var(--border);
  background: var(--accent);
  color: var(--accent-foreground);
}

.credit-role-option input {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
}

@media (max-width: 640px) {
  .credit-role-picker__menu {
    width: 100%;
  }
}
</style>
