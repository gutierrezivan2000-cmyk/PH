import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#7c5cff] text-white",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-[#ff6f6f]/15 text-[#ff6f6f] border-[#ff6f6f]/30",
        outline:
          "border-border text-muted-foreground bg-transparent",
        accent:
          "bg-[rgba(124,92,255,0.10)] text-[#9a7fff] border-[rgba(124,92,255,0.40)]",
        ok:
          "bg-[rgba(76,214,160,0.10)] text-[#4cd6a0] border-[rgba(76,214,160,0.30)]",
        warn:
          "bg-[rgba(255,185,88,0.10)] text-[#ffb958] border-[rgba(255,185,88,0.30)]",
        legal:
          "bg-[rgba(244,199,128,0.10)] text-[#f4c780] border-[rgba(244,199,128,0.30)]",
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
