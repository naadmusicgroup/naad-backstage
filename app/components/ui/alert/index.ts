import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Alert } from './Alert.vue'
export { default as AlertAction } from './AlertAction.vue'
export { default as AlertDescription } from './AlertDescription.vue'
export { default as AlertTitle } from './AlertTitle.vue'

export const alertVariants = cva(
  'glass-card relative w-full rounded-xl border p-4 text-sm transition-colors [&>svg+div]:pl-8 [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default:
          'text-card-foreground',
        destructive:
          'border-destructive/30 bg-[color-mix(in_srgb,var(--destructive)_10%,var(--card))] text-destructive',
        success:
          'border-[color-mix(in_srgb,var(--status-success)_34%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_11%,var(--card))] text-[var(--status-success)]',
        warning:
          'border-[color-mix(in_srgb,var(--status-warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,var(--card))] text-foreground',
        info:
          'border-[color-mix(in_srgb,var(--status-info)_34%,transparent)] bg-[color-mix(in_srgb,var(--status-info)_11%,var(--card))] text-[var(--status-info)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type AlertVariants = VariantProps<typeof alertVariants>
