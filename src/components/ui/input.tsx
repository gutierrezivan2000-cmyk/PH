import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-secondary px-3.5 py-2 text-sm text-foreground transition-all placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
