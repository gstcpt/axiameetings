"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Typography } from "@/components/ui/typographys";

const cardVariants = cva(
  "rounded-2xl transition-all duration-500",
  {
    variants: {
      variant: {
        default: "bg-white border border-slate-200 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_12px_40px_rgba(0,43,91,0.06)] dark:bg-slate-900 dark:border-slate-800 dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]",
        elevated: "bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:bg-slate-900 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)]",
        outline: "bg-transparent border border-slate-200 hover:border-[#002B5B]/30 dark:border-slate-800 dark:hover:border-blue-500/50",
        filled: "bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70",
        glass: "bg-white/70 backdrop-blur-3xl border border-white/40 shadow-xl dark:bg-slate-900/60 dark:border-slate-800/40 dark:shadow-black/30",
        gradient: "bg-gradient-to-br from-white to-slate-50 border border-slate-200 dark:from-slate-900 dark:to-slate-950 dark:border-slate-800",
      },
      padding: {
        none: "",
        sm: "p-3",
        default: "p-4",
        lg: "p-6",
      },
      hover: {
        true: "cursor-pointer hover:-translate-y-1",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
      hover: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, hover, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, hover }), className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-4 pb-2", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement> & { color?: any }
>(({ className, children, ...props }, ref) => (
  <Typography
    variant="h4"
    as="h4"
    className={cn("leading-tight", className)}
    {...props}
  >
    {children}
  </Typography>
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & { color?: any }
>(({ className, children, ...props }, ref) => (
  <Typography
    variant="p"
    color="secondary"
    className={cn("mt-1", className)}
    {...props}
  >
    {children}
  </Typography>
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
};
