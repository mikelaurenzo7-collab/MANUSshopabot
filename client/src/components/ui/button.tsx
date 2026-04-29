import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[12.5px] font-semibold tracking-wide transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85 hover:shadow-[var(--shadow-button-hover-primary)] active:bg-primary/95 active:shadow-sm",
        destructive:
          "bg-destructive text-white hover:bg-destructive/85 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 hover:shadow-[var(--shadow-button-hover-destructive)] active:bg-destructive/95 active:shadow-sm",
        outline:
          "border border-white/15 bg-white/[0.02] shadow-xs hover:bg-white/[0.06] hover:border-white/25 hover:shadow-sm dark:bg-white/[0.02] dark:border-white/15 dark:hover:bg-white/[0.06] dark:hover:border-white/25 dark:hover:shadow-sm active:bg-white/[0.03] active:border-white/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/75 hover:shadow-[var(--shadow-button-hover-secondary)] active:bg-secondary/85 active:shadow-sm",
        ghost:
          "hover:bg-white/[0.06] dark:hover:bg-white/[0.06] hover:shadow-xs hover:-translate-y-0.5 active:bg-white/[0.04] active:shadow-none active:translate-y-0",
        link: "text-primary underline-offset-4 hover:underline hover:-translate-y-0 shadow-none active:opacity-75",
      },
      size: {
        default: "h-8 px-3.5 py-1.5 has-[>svg]:px-3",
        sm: "h-7 rounded-md gap-1.5 px-2.5 has-[>svg]:px-2 text-[11px]",
        lg: "h-9 rounded-md px-5 has-[>svg]:px-4 gap-2 text-[13px]",
        icon: "size-8 rounded-md",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
