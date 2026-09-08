import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--accent)] text-white",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/30",
        outline:
          "border-border text-muted-foreground bg-transparent",
        accent:
          "bg-[rgb(var(--accent-rgb) / 0.1)] text-[var(--accent-hi)] border-[rgb(var(--accent-rgb) / 0.4)]",
        ok:
          "bg-[rgb(var(--ok-rgb) / 0.1)] text-[var(--ok)] border-[rgb(var(--ok-rgb) / 0.3)]",
        warn:
          "bg-[rgb(var(--warn-rgb) / 0.1)] text-[var(--warn)] border-[rgb(var(--warn-rgb) / 0.3)]",
        legal:
          "bg-[rgb(var(--legal-rgb) / 0.10)] text-[var(--legal)] border-[rgb(var(--legal-rgb) / 0.30)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
