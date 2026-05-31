<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  SlidersHorizontal,
} from "lucide-vue-next"
import type {
  Column,
  ColumnDef,
  PaginationState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/vue-table"
import {
  FlexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
} from "@tanstack/vue-table"
import type { HTMLAttributes } from "vue"
import { computed, ref, watch } from "vue"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Align = "left" | "center" | "right"
type RowRecord = Record<string, unknown>

interface DataTableColumn {
  key: string
  label: string
  align?: Align
  class?: HTMLAttributes["class"]
  headerClass?: HTMLAttributes["class"]
  cellClass?: HTMLAttributes["class"]
  accessor?: (row: any) => unknown
  sortable?: boolean
  searchable?: boolean
  hideable?: boolean
}

const props = withDefaults(defineProps<{
  columns: DataTableColumn[]
  data: unknown[]
  emptyMessage?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: "inbox" | "search" | "chart" | "file"
  searchPlaceholder?: string
  enablePagination?: boolean
  enableColumnVisibility?: boolean
  pageSize?: number
  rowKey?: string | ((row: any, index: number) => string | number)
  rowClass?: HTMLAttributes["class"] | ((row: any) => HTMLAttributes["class"])
  tableClass?: HTMLAttributes["class"]
  wrapperClass?: HTMLAttributes["class"]
  expandedRowIds?: Array<string | number>
}>(), {
  emptyMessage: "No entries to display.",
  emptyTitle: "",
  emptyDescription: "",
  emptyIcon: "search",
  searchPlaceholder: "",
  enablePagination: false,
  enableColumnVisibility: false,
  pageSize: 10,
  rowKey: "id",
  expandedRowIds: () => [],
})

defineSlots<{
  [name: string]: ((props: { row: any; value?: any; cell?: any }) => any) | undefined
  expandedRow?: (props: { row: any; value?: any; cell?: any }) => any
}>()

const sorting = ref<SortingState>([])
const globalFilter = ref("")
const columnVisibility = ref<VisibilityState>({})
const pagination = ref<PaginationState>({
  pageIndex: 0,
  pageSize: props.pageSize,
})

const rows = computed(() => props.data as RowRecord[])
const hasToolbar = computed(() => Boolean(props.searchPlaceholder || props.enableColumnVisibility))
const emptyStateTitle = computed(() => props.emptyTitle || props.emptyMessage)

const columnDefs = computed<ColumnDef<RowRecord>[]>(() => props.columns.map((column) => ({
  id: column.key,
  accessorFn: (row) => cellValue(row, column),
  header: column.label,
  enableHiding: column.hideable ?? true,
  enableSorting: column.sortable ?? Boolean(column.accessor),
  meta: column,
})))

const table = useVueTable({
  get data() {
    return rows.value
  },
  get columns() {
    return columnDefs.value
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get globalFilter() {
      return globalFilter.value
    },
    get columnVisibility() {
      return columnVisibility.value
    },
    get pagination() {
      return pagination.value
    },
  },
  onSortingChange: (updater) => updateState(updater, sorting),
  onGlobalFilterChange: (updater) => updateState(updater, globalFilter),
  onColumnVisibilityChange: (updater) => updateState(updater, columnVisibility),
  onPaginationChange: (updater) => updateState(updater, pagination),
  globalFilterFn: (row, _columnId, filterValue) => {
    const query = String(filterValue ?? "").trim().toLowerCase()

    if (!query) {
      return true
    }

    return props.columns
      .filter((column) => column.searchable ?? true)
      .some((column) => String(cellValue(row.original, column) ?? "").toLowerCase().includes(query))
  },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: props.enablePagination ? getPaginationRowModel() : undefined,
})

const tablePage = computed(() => table.getState().pagination.pageIndex + 1)
const tablePageCount = computed(() => table.getPageCount() || 1)
const tableTotalCount = computed(() => table.getFilteredRowModel().rows.length)
const tablePaginationSummary = computed(() => `Page ${tablePage.value} of ${tablePageCount.value}`)

watch(
  () => props.pageSize,
  (pageSize) => {
    pagination.value = {
      pageIndex: 0,
      pageSize,
    }
  },
)

function updateState<T>(updater: Updater<T>, state: { value: T }) {
  state.value = typeof updater === "function" ? (updater as (value: T) => T)(state.value) : updater
}

function cellValue(row: RowRecord, column: DataTableColumn) {
  if (column.accessor) {
    return column.accessor(row)
  }

  return row[column.key] ?? ""
}

function columnMeta(column: Column<RowRecord>) {
  return column.columnDef.meta as DataTableColumn
}

function alignClass(align?: Align) {
  if (align === "right") {
    return "text-right"
  }

  if (align === "center") {
    return "text-center"
  }

  return "text-left"
}

function headClass(column: Column<RowRecord>) {
  const meta = columnMeta(column)
  return cn("h-10 whitespace-nowrap text-xs uppercase tracking-[0.08em]", alignClass(meta.align), meta.headerClass, meta.class)
}

function cellClass(column: Column<RowRecord>) {
  const meta = columnMeta(column)
  return cn("whitespace-nowrap px-4 py-3 align-middle", alignClass(meta.align), meta.cellClass, meta.class)
}

function rowId(row: RowRecord, index: number) {
  if (typeof props.rowKey === "function") {
    return String(props.rowKey(row, index))
  }

  return String(row[props.rowKey] ?? index)
}

function currentRowClass(row: RowRecord) {
  return typeof props.rowClass === "function" ? props.rowClass(row) : props.rowClass
}

function cellSlotName(columnId: string) {
  return `cell-${columnId}`
}

function isExpanded(row: RowRecord, index: number) {
  return props.expandedRowIds.includes(rowId(row, index))
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-"
  }

  return String(value)
}

function updateTablePage(value: number) {
  table.setPageIndex(value - 1)
}
</script>

<template>
  <div :class="cn('data-table space-y-3', props.wrapperClass)" data-slot="data-table">
    <div v-if="hasToolbar" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div v-if="searchPlaceholder" class="relative w-full sm:max-w-xs">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="globalFilter"
          type="search"
          :placeholder="searchPlaceholder"
          class="h-10 pl-9"
        />
      </div>
      <div v-else />

      <DropdownMenu v-if="enableColumnVisibility">
        <DropdownMenuTrigger as-child>
          <Button variant="secondary" size="sm" class="gap-2">
            <SlidersHorizontal class="size-4" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="data-table-column-menu w-48">
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuCheckboxItem
              v-for="column in table.getAllColumns().filter((entry) => entry.getCanHide())"
              :key="column.id"
              :checked="column.getIsVisible()"
              @update:checked="(value) => column.toggleVisibility(Boolean(value))"
            >
              {{ columnMeta(column).label }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="shadcn-data-table-frame overflow-hidden rounded-xl border border-[var(--surface-border)] bg-card shadow-[var(--shadow-card)]">
      <Table :class="cn('min-w-full', props.tableClass)">
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id" class="bg-card hover:bg-card">
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="headClass(header.column)"
            >
              <Button
                v-if="!header.isPlaceholder && header.column.getCanSort()"
                variant="ghost"
                size="xs"
                type="button"
                :class="cn(
                  'h-auto gap-1.5 rounded-md px-1 py-0 text-inherit shadow-none hover:bg-transparent hover:text-foreground',
                  columnMeta(header.column).align === 'right' && 'ml-auto justify-end',
                  columnMeta(header.column).align === 'center' && 'mx-auto justify-center',
                )"
                @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')"
              >
                <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                <ArrowUp v-if="header.column.getIsSorted() === 'asc'" class="size-3.5" />
                <ArrowDown v-else-if="header.column.getIsSorted() === 'desc'" class="size-3.5" />
                <ArrowUpDown v-else class="size-3.5 opacity-55" />
              </Button>
              <FlexRender
                v-else-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="table.getRowModel().rows.length">
            <template v-for="(row, rowIndex) in table.getRowModel().rows" :key="row.id">
              <TableRow :class="cn('hover:bg-muted/35', currentRowClass(row.original))">
                <TableCell
                  v-for="cell in row.getVisibleCells()"
                  :key="cell.id"
                  :class="cellClass(cell.column)"
                >
                  <slot
                    :name="cellSlotName(cell.column.id)"
                    :row="cell.row.original"
                    :value="cell.getValue()"
                    :cell="cell"
                  >
                    {{ displayValue(cell.getValue()) }}
                  </slot>
                </TableCell>
              </TableRow>
              <TableRow v-if="$slots.expandedRow && isExpanded(row.original, rowIndex)" class="hover:bg-transparent">
                <TableCell :colspan="row.getVisibleCells().length" class="bg-muted/20 p-4">
                  <slot name="expandedRow" :row="row.original" />
                </TableCell>
              </TableRow>
            </template>
          </template>
          <TableRow v-else>
            <TableCell :colspan="columns.length" class="p-4">
              <AppEmptyState
                compact
                :title="emptyStateTitle"
                :description="emptyDescription"
                :icon="emptyIcon"
                class="min-h-28 border-0 bg-transparent shadow-none"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <AppPagination
      v-if="enablePagination"
      :page="tablePage"
      :page-size="table.getState().pagination.pageSize"
      :total-count="tableTotalCount"
      :total-pages="tablePageCount"
      :summary="tablePaginationSummary"
      aria-label="Table pagination"
      @update:page="updateTablePage"
    />
  </div>
</template>

<style scoped>
:global(.data-table-column-menu) {
  max-height: min(18rem, var(--radix-dropdown-menu-content-available-height, calc(100vh - 120px)));
}
</style>
