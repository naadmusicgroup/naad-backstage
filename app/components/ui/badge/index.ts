import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors duration-200 [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-[var(--surface-border)] bg-[var(--surface-glass)] text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-[var(--surface-border)] bg-[var(--surface-glass)] text-foreground',
        ghost:
          'border-transparent bg-transparent text-foreground shadow-none',
        link:
          'border-transparent bg-transparent px-0 text-primary underline-offset-4 shadow-none hover:underline',
        success:
          'border-[color-mix(in_srgb,var(--status-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--status-success)]',
        warning:
          'border-[color-mix(in_srgb,var(--status-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] text-[var(--status-warning)]',
        info:
          'border-[color-mix(in_srgb,var(--status-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--status-info)_12%,transparent)] text-[var(--status-info)]',
        muted:
          'border-[var(--surface-border)] bg-[var(--surface-muted)] text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
