"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border font-semibold uppercase transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#002B5B] text-white shadow-sm",
        primary:
          "border-transparent bg-[#002B5B] text-white shadow-sm",
        secondary:
          "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300",
        success:
          "border-transparent bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 dark:shadow-none",
        warning:
          "border-transparent bg-amber-500 text-white shadow-sm shadow-amber-500/20 dark:shadow-none",
        error:
          "border-transparent bg-red-500 text-white shadow-sm shadow-red-500/20 dark:shadow-none",
        danger:
          "border-transparent bg-red-500 text-white shadow-sm shadow-red-500/20 dark:shadow-none",
        destructive:
          "border-transparent bg-red-500 text-white shadow-sm shadow-red-500/20 dark:shadow-none",
        outline:
          "border-slate-200 text-slate-700 bg-transparent dark:border-slate-800 dark:text-slate-300",
        ghost:
          "border-transparent bg-slate-100/50 text-slate-600 hover:bg-slate-100 transition-colors dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
