<script setup lang="ts">
const props = withDefaults(defineProps<{
  page: number
  pageSize: number
  totalCount: number
  totalPages?: number
  pending?: boolean
  summary?: string
  ariaLabel?: string
}>(), {
  totalPages: undefined,
  pending: false,
  summary: "",
  ariaLabel: "Pagination",
})

const emit = defineEmits<{
  "update:page": [page: number]
}>()

const pageCount = computed(() => Math.max(1, props.totalPages ?? Math.ceil(props.totalCount / Math.max(1, props.pageSize))))
const currentPage = computed(() => Math.min(Math.max(1, props.page), pageCount.value))
const effectiveTotal = computed(() => Math.max(props.totalCount, pageCount.value * Math.max(1, props.pageSize)))
const summaryText = computed(() => props.summary || `Page ${currentPage.value} of ${pageCount.value}`)

function updatePage(nextPage: number) {
  const safePage = Math.min(Math.max(1, nextPage), pageCount.value)

  if (props.pending || safePage === currentPage.value) {
    return
  }

  emit("update:page", safePage)
}
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p class="text-sm text-muted-foreground">{{ summaryText }}</p>
    <Pagination
      :page="currentPage"
      :items-per-page="Math.max(1, props.pageSize)"
      :total="effectiveTotal"
      :sibling-count="1"
      show-edges
      :disabled="props.pending"
      :aria-label="props.ariaLabel"
      class="mx-0 w-auto justify-start sm:justify-end"
      @update:page="updatePage"
    >
      <PaginationContent v-slot="{ items }" class="hidden sm:flex">
        <PaginationPrevious />
        <template v-for="(item, index) in items" :key="`${item.type}-${index}-${'value' in item ? item.value : 'ellipsis'}`">
          <PaginationItem
            v-if="item.type === 'page'"
            :value="item.value"
            :is-active="item.value === currentPage"
          >
            {{ item.value }}
          </PaginationItem>
          <PaginationEllipsis v-else :index="index" />
        </template>
        <PaginationNext />
      </PaginationContent>

      <PaginationContent class="sm:hidden">
        <PaginationPrevious />
        <PaginationItem :value="currentPage" is-active>
          {{ currentPage }}
        </PaginationItem>
        <PaginationNext />
      </PaginationContent>
    </Pagination>
  </div>
</template>
