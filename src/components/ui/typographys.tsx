"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const typographyVariants = cva("text-slate-900 dark:text-slate-100 transition-colors", {
  variants: {
    variant: {
      h1:    "text-xl md:text-2xl font-semibold leading-tight dark:text-slate-50",
      h2:    "text-lg md:text-xl font-semibold leading-tight dark:text-slate-50",
      h3:    "text-base md:text-lg font-semibold leading-snug dark:text-slate-50",
      h4:    "text-sm md:text-base font-semibold leading-normal dark:text-slate-50",
      p:     "text-[13px] md:text-sm text-slate-500 font-normal leading-relaxed dark:text-slate-400",
      lead:  "text-sm text-slate-600 font-medium leading-relaxed dark:text-slate-300",
      large: "text-[13px] md:text-sm font-semibold dark:text-slate-100",
      small: "text-[11px] font-medium leading-none dark:text-slate-400",
      muted: "text-[11px] text-slate-400 font-normal dark:text-slate-500",
      label: "text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500",
    },
    color: {
      default: "text-slate-900 dark:text-slate-100",
      primary: "text-[#002B5B] dark:text-white",
      secondary: "text-slate-500 dark:text-slate-400",
      accent: "text-blue-600 dark:text-blue-400",
      white: "text-white",
      error: "text-red-500 dark:text-red-400",
    },
  },
  defaultVariants: {
    variant: "p",
    color: "default",
  },
});

export interface TypographyProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement | HTMLParagraphElement>, "color">,
    VariantProps<typeof typographyVariants> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant, color, as, children, ...props }, ref) => {
    const Component = as || (variant && ["h1", "h2", "h3", "h4"].includes(variant) ? (variant as any) : "p");
    
    return (
      <Component
        ref={ref as any}
        className={cn(typographyVariants({ variant, color }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Typography.displayName = "Typography";

export { Typography, typographyVariants };
