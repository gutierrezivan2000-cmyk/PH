import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-white border border-[var(--accent)] shadow-[0_8px_24px_-8px_rgb(var(--accent-rgb) / 0.4)] hover:bg-[var(--accent-hi)] hover:border-[var(--accent-hi)] hover:-translate-y-px hover:shadow-[0_14px_36px_-10px_rgb(var(--accent-rgb) / 0.5)] active:translate-y-0",
        destructive:
          "bg-[var(--danger)] text-white border border-[var(--danger)] shadow-sm hover:bg-[var(--danger)] hover:-translate-y-px",
        outline:
          "border border-black/14 dark:border-white/14 bg-secondary text-foreground hover:bg-muted hover:-translate-y-px active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent hover:bg-muted",
        ghost:
          "border border-transparent text-muted-foreground hover:text-foreground hover:border-black/14 dark:hover:border-white/14",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
        ink: "bg-foreground text-background border border-foreground hover:bg-foreground/90 hover:-translate-y-px",
      },
      size: {
        default: "h-10 px-[18px] py-2.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-[14.5px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
