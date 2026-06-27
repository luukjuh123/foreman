import * as React from "react";
import { cn } from "@/lib/utils";

type ProgressVariant = "default" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<ProgressVariant, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function autoVariant(value: number): ProgressVariant {
  if (value >= 100) return "success";
  return "default";
}

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: ProgressVariant | "auto";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, max = 100, variant = "auto", size = "md", showLabel = false, className, ...props }, ref) => {
    const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const resolvedVariant = variant === "auto" ? autoVariant(percent) : variant;

    const sizeClasses = {
      sm: "h-1.5",
      md: "h-2",
      lg: "h-3",
    };

    return (
      <div className={cn("flex items-center gap-2.5", className)} ref={ref} {...props}>
        <div
          className={cn("flex-1 rounded-full bg-muted overflow-hidden", sizeClasses[size])}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              VARIANT_CLASSES[resolvedVariant]
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        {showLabel && (
          <span className={cn(
            "text-xs font-medium tabular-nums shrink-0",
            percent === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            {percent}%
          </span>
        )}
      </div>
    );
  }
);
Progress.displayName = "Progress";

interface StackedProgressSegment {
  value: number;
  color: string;
  label?: string;
}

interface StackedProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  segments: StackedProgressSegment[];
  total: number;
  size?: "sm" | "md" | "lg";
}

const StackedProgress = React.forwardRef<HTMLDivElement, StackedProgressProps>(
  ({ segments, total, size = "md", className, ...props }, ref) => {
    const sizeClasses = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" };

    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        <div className={cn("flex rounded-full bg-muted overflow-hidden", sizeClasses[size])}>
          {segments.map((seg, i) => {
            const pct = total > 0 ? (seg.value / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={i}
                className={cn("h-full transition-all duration-500", seg.color)}
                style={{ width: `${pct}%` }}
                title={seg.label}
              />
            );
          })}
        </div>
      </div>
    );
  }
);
StackedProgress.displayName = "StackedProgress";

export { Progress, StackedProgress };
export type { ProgressVariant, StackedProgressSegment };
