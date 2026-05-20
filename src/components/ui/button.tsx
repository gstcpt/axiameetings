import { Slot } from "@radix-ui/react-slot"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-2xl text-xs font-semibold uppercase whitespace-nowrap max-w-full transition-all duration-300 outline-none select-none active:scale-95 disabled:pointer-events-none disabled:opacity-50 shadow-sm",
  {
    variants: {
      variant: {
        default: "bg-[#002B5B] text-white hover:bg-blue-700 shadow-blue-900/20 shadow-lg dark:bg-blue-600 dark:hover:bg-blue-700 dark:shadow-none",
        outline:
          "border-2 border-slate-200 bg-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-700",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
        ghost:
          "hover:bg-slate-100 text-slate-500 hover:text-slate-900 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 shadow-red-900/20 shadow-lg dark:shadow-none",
        danger:
          "bg-red-500 text-white hover:bg-red-600 shadow-red-900/20 shadow-lg dark:shadow-none",
        primary:
          "bg-[#002B5B] text-white hover:bg-blue-700 shadow-blue-900/20 shadow-lg dark:bg-blue-600 dark:hover:bg-blue-700 dark:shadow-none",
        success:
          "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-900/20 shadow-lg dark:shadow-none",
        link: "text-[#002B5B] underline-offset-4 hover:underline lowercase tracking-normal font-bold dark:text-blue-400",
      },
      size: {
        default: "h-10 px-6 gap-2 sm:h-9 sm:px-4",
        xs: "h-8 px-3 gap-1.5 text-xs",
        sm: "h-9 px-5 gap-1.5 text-xs",
        lg: "h-12 px-8 gap-2.5 text-sm",
        mobile: "h-9 px-4 gap-2",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button(
  {
    className,
    variant = "default",
    size = "default",
    asChild = false,
    ...props
  }: ButtonPrimitive.Props &
    VariantProps<typeof buttonVariants> & { asChild?: boolean }
) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...(props as any)}
    />
  )
}

export { Button, buttonVariants }