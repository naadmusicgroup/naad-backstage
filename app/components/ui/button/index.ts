import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex cursor-pointer select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[background-color,border-color,color,box-shadow,filter,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'premium-box-button premium-box-button-primary',
        destructive:
          'premium-box-button premium-box-button-danger',
        outline:
          'premium-box-button premium-box-button-outline',
        secondary:
          'premium-box-button premium-box-button-secondary',
        ghost: 'neomorphic-ghost-button hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /* Neomorphic raised button - soft embossed look */
        'neo-raised':
          'neomorphic-button neomorphic-button-raised',
        /* Neomorphic inset/pressed button */
        'neo-inset':
          'neomorphic-button neomorphic-button-inset',
        /* Neomorphic subtle - lighter touch */
        'neo-subtle':
          'neomorphic-button neomorphic-button-subtle',
      },
      size: {
        xs: 'h-7 rounded-lg px-2.5 text-xs [&_svg]:size-3.5',
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs [&_svg]:size-3.5',
        lg: 'h-10 rounded-lg px-6',
        icon: 'h-9 w-9 [&_svg]:size-4',
        'icon-xs': 'size-7 rounded-lg [&_svg]:size-3.5',
        'icon-sm': 'size-8 rounded-lg [&_svg]:size-4',
        'icon-lg': 'size-10 rounded-lg [&_svg]:size-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
