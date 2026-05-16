import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#7c5cff] text-white border border-[#7c5cff] shadow-[0_8px_24px_-8px_rgba(124,92,255,0.4)] hover:bg-[#9a7fff] hover:border-[#9a7fff] hover:-translate-y-px hover:shadow-[0_14px_36px_-10px_rgba(124,92,255,0.5)] active:translate-y-0",
        destructive:
          "bg-[#ff6f6f] text-white border border-[#ff6f6f] shadow-sm hover:bg-[#ff8585] hover:-translate-y-px",
        outline:
          "border border-black/14 dark:border-white/14 bg-secondary text-foreground hover:bg-muted hover:-translate-y-px active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent hover:bg-muted",
        ghost:
          "border border-transparent text-muted-foreground hover:text-foreground hover:border-black/14 dark:hover:border-white/14",
        link: "text-[#7c5cff] underline-offset-4 hover:underline",
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
